import Foundation
import UIKit
import UserNotifications
import SwiftUI
import ADHDoneNative
import ADHDoneShared
#if canImport(AlarmKit)
import AlarmKit
#endif

/// The phone's alarms (the twin of Android's AlarmScheduler + AlarmService +
/// AlarmStore). Nov 4 2026.
///
/// The web app hands over the WHOLE set of task alarms on every change
/// (AlarmBridge.sync, from widgetBridge.alarmSetFor) plus the timers' own
/// alarms (bookOwn), and this books each one the strongest way the phone allows:
///
///  - iOS 26 and newer, once the person allowed it: a real AlarmKit alarm. It
///    rings full screen over the lock screen, at alarm volume, through silent
///    mode and Focus, with Stop and (for a task) Snooze 10 min; an event gets
///    Got it only (Anna, Oct 13 2026). The sound is the one they picked, or the
///    phone's own; "Read it to me" is the reminder rendered to a sound file when
///    the alarm is booked (SpeechFiles), since a closed app can't talk.
///  - iOS 17–25, or AlarmKit not allowed: a notification of the phone's own at
///    the same moment, with the alarm sound and the same buttons (Done, Snooze,
///    Later; Got it for an event).
///
/// Silence (quietFor, the Control Center button) and "silent alarms during
/// events" turn the alarms due inside those spans into quiet notifications;
/// when the span ends, or the person turns silence off, they are booked back
/// as alarms (replan). The list the phone holds lives in SharedStore (keychain),
/// so it survives the app being closed and the widget can read it.
final class AlarmEngine {
    static let shared = AlarmEngine()

    private let center = UNUserNotificationCenter.current()
    private let queue = DispatchQueue(label: "adhdone.alarm.engine")
    /// Spoken alarms are rendered for the nearest ones only; a sentence takes seconds.
    private let spokenLimit = 24
    private var started = false

    private init() {}

    // MARK: - App start

    func start() {
        guard !started else { return }
        started = true
        // Pushes the extension wanted gone (a reminder for a finished task) but
        // could not take down itself.
        let ids = SharedStore.takePendingRemovals()
        if !ids.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
        watchAlarmKit()
        // Anything whose silence span has ended goes back to being an alarm.
        queue.async { self.replanAll() }
    }

    // MARK: - AlarmKit

    /// "authorized", "denied", "notDetermined" or "unavailable" (older iOS / Xcode).
    func alarmKitState() -> String {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            switch AlarmManager.shared.authorizationState {
            case .authorized: return "authorized"
            case .denied: return "denied"
            case .notDetermined: return "notDetermined"
            @unknown default: return "notDetermined"
            }
        }
        #endif
        return "unavailable"
    }

    /// AlarmKit exists on this phone (whether or not it is allowed yet).
    var alarmKitAvailable: Bool { alarmKitState() != "unavailable" }
    var alarmKitUsable: Bool { alarmKitState() == "authorized" }

    func requestAlarmKit(_ completion: @escaping (Bool) -> Void) {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task {
                let state = try? await AlarmManager.shared.requestAuthorization()
                let ok = state == .authorized
                if ok { self.queue.async { self.replanAll() } }
                completion(ok)
            }
            return
        }
        #endif
        completion(false)
    }

    private func watchAlarmKit() {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            Task.detached { [weak self] in
                for await alarms in AlarmManager.shared.alarmUpdates {
                    self?.alarmKitChanged(alarms)
                }
            }
        }
        #endif
    }

    #if canImport(AlarmKit)
    @available(iOS 26.0, *)
    private func alarmKitChanged(_ alarms: [Alarm]) {
        // An alarm that is alerting right now goes in "What rang" once; one
        // that AlarmKit no longer lists is over.
        let listed = Set(alarms.map { $0.id })
        let alerting = Set(alarms.filter { $0.state == .alerting }.map { $0.id })
        let held = SharedStore.alarms()
        for a in held where a.booked == "alarmkit" {
            let uuid = AlarmIds.uuid(for: a.id)
            if alerting.contains(uuid) && !ringLogged.contains(a.id) {
                ringLogged.insert(a.id)
                SharedStore.logRing(RingRow(at: Date().timeIntervalSince1970 * 1000, taskId: a.taskId,
                                            title: a.spokenTitle, body: a.body, kind: "alarm"))
            }
            // Rang out, nobody answered: AlarmKit drops it from the list a while
            // after alerting ends. Counted as ignored, like Android's ring-out.
            if !listed.contains(uuid), ringLogged.contains(a.id), a.at < Date().timeIntervalSince1970 * 1000 - 60_000 {
                ringLogged.remove(a.id)
                if !answeredIds.contains(a.id) {
                    SharedStore.addActivity(taskId: a.taskId) { $0.ignored += 1 }
                    SharedStore.settleRing(taskId: a.taskId, outcome: "rang_out")
                }
                answeredIds.remove(a.id)
            }
        }
    }
    #endif
    private var ringLogged = Set<String>()
    private var answeredIds = Set<String>()

    // MARK: - The alarm set

    /// The web app's whole set of task alarms (AlarmBridge.sync). Alarms the
    /// phone booked on its own (bookOwn: timers, a push's alarm) are kept.
    func replaceTaskAlarms(_ incoming: [StoredAlarm], activeTaskIds: [String], quietEnd: String) {
        queue.async {
            SharedStore.write(.quietEnd, quietEnd)
            let previousActive = SharedStore.read(.activeTaskIds, as: [String].self) ?? []
            SharedStore.write(.activeTaskIds, activeTaskIds)
            // A task that was active last time and isn't now is finished, parked
            // or gone: a reminder about it that still lands is not shown
            // (ADHDoneNotify reads this), and its pending copies go.
            let nowActive = Set(activeTaskIds)
            let finished = previousActive.filter { !nowActive.contains($0) }
            for t in finished {
                SharedStore.markFinished(taskId: t)
                ReminderActions.cancelPending(taskId: t)
            }
            SharedStore.unmarkFinished(taskIds: activeTaskIds)

            let held = SharedStore.alarms()
            let own = held.filter { $0.own }
            let oldTask = held.filter { !$0.own }
            let oldById = Dictionary(oldTask.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
            var next: [StoredAlarm] = own
            var seen = Set<String>()
            for var a in incoming {
                // One entry per id, whatever the web app sent.
                if seen.contains(a.id) { continue }
                seen.insert(a.id)
                if let was = oldById[a.id] {
                    // The same alarm again: keep how it is booked and a snooze that runs.
                    a.booked = was.booked
                    a.snoozedUntil = was.snoozedUntil
                    if was.at == a.at && was.heading == a.heading && was.body == a.body && was.event == a.event && was.openLabel == a.openLabel {
                        next.append(a)
                        continue
                    }
                }
                a.booked = ""
                next.append(a)
            }
            // Gone from the set: off the phone.
            let keep = Set(incoming.map { $0.id })
            for a in oldTask where !keep.contains(a.id) { self.unbook(a) }
            SharedStore.saveAlarms(next)
            self.bookAll()
        }
    }

    /// A timer's end, booked outright (AlarmBridge.bookOwn).
    func bookOwn(_ alarm: StoredAlarm) {
        queue.async {
            var a = alarm
            a.own = true
            a.booked = ""
            // Its own sound is fetched for next time; this ring uses it when it's already here.
            SoundFiles.prefetch(url: a.soundUrl)
            var list = SharedStore.alarms().filter { $0.id != a.id }
            if let was = SharedStore.alarm(id: a.id), was.booked != "" { self.unbook(was) }
            list.append(a)
            SharedStore.saveAlarms(list)
            self.bookAll()
        }
    }

    func cancel(id: String) {
        queue.async {
            guard let a = SharedStore.alarm(id: id) else { return }
            self.unbook(a)
            SharedStore.saveAlarms(SharedStore.alarms().filter { $0.id != id })
        }
    }

    /// Every alarm of a task (the server's "this task is gone" message, a finish).
    func cancelTask(taskId: String) {
        queue.async {
            let list = SharedStore.alarms()
            for a in list where a.taskId == taskId { self.unbook(a) }
            SharedStore.saveAlarms(list.filter { $0.taskId != taskId })
            SharedStore.markFinished(taskId: taskId)
            ReminderActions.cancelPending(taskId: taskId)
        }
    }

    /// The server's "here are this task's alarms now" message (set_alarms_task).
    func replaceTask(taskId: String, with alarms: [StoredAlarm]) {
        queue.async {
            let held = SharedStore.alarms()
            let others = held.filter { $0.taskId != taskId || $0.own }
            for a in held where a.taskId == taskId && !a.own { self.unbook(a) }
            var next = others
            for var a in alarms { a.booked = ""; a.own = false; next.append(a) }
            SharedStore.saveAlarms(next)
            self.bookAll()
        }
    }

    /// Silence began or ended, event windows changed: every alarm is looked at again.
    func replan() {
        queue.async { self.replanAll() }
    }

    /// The ring sound changed: every booked alarm is booked again with it.
    func rebookAllForSound() {
        queue.async {
            var list = SharedStore.alarms()
            for i in list.indices where list[i].booked != "" {
                self.unbook(list[i])
                list[i].booked = ""
            }
            SharedStore.saveAlarms(list)
            self.bookAll()
        }
    }

    /// Snooze from an alarm shown as a notification: the same alarm, `minutes` on.
    func snooze(alarmId: String, minutes: Int) {
        queue.async {
            guard var a = SharedStore.alarm(id: alarmId) else { return }
            self.unbook(a)
            a.snoozedUntil = Date().timeIntervalSince1970 * 1000 + Double(minutes * 60 * 1000)
            a.booked = ""
            SharedStore.saveAlarms(SharedStore.alarms().map { $0.id == a.id ? a : $0 })
            self.bookAll()
        }
    }

    /// Stop / Later / Got it on an alarm: over, nothing comes back.
    func answered(alarmId: String, outcome: String) {
        queue.async {
            self.answeredIds.insert(alarmId)
            guard let a = SharedStore.alarm(id: alarmId) else { return }
            self.unbook(a)
            if outcome == "dismissed" { SharedStore.addActivity(taskId: a.taskId) { $0.dismissed = true } }
            SharedStore.saveAlarms(SharedStore.alarms().filter { $0.id != alarmId })
        }
    }

    /// Stop whatever is ringing right now (AlarmBridge.stopRinging).
    func stopAll() {
        SpeechFiles.shared.stop()
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            if let alarms = try? AlarmManager.shared.alarms {
                for alarm in alarms where alarm.state == .alerting { try? AlarmManager.shared.stop(id: alarm.id) }
            }
        }
        #endif
    }

    // MARK: - Booking

    /// How an alarm due at `ms` should be held right now.
    private func wantedBooking(for a: StoredAlarm, at ms: Double) -> String {
        if SharedStore.quietUntilMs > ms || SharedStore.quietForEvent(at: ms) { return "quiet" }
        return alarmKitUsable ? "alarmkit" : "notification"
    }

    private func ringTime(_ a: StoredAlarm) -> Double {
        let now = Date().timeIntervalSince1970 * 1000
        return a.snoozedUntil > now ? a.snoozedUntil : a.at
    }

    /// Books every alarm that isn't held the way it should be, and drops the past.
    private func bookAll() {
        let now = Date().timeIntervalSince1970 * 1000
        var list = SharedStore.alarms()
        var changed = false
        // Past alarms stay a day (a snooze may still bring one back; the web
        // app lists them that long too), then go.
        let cutoff = now - 24 * 3600 * 1000
        let gone = list.filter { ringTime($0) < cutoff }
        for a in gone { unbook(a) }
        if !gone.isEmpty { list.removeAll { ringTime($0) < cutoff }; changed = true }

        let upcoming = list.filter { ringTime($0) > now }.sorted { ringTime($0) < ringTime($1) }
        var spokenNames = Set<String>()
        var spokenBudget = spokenLimit
        for i in list.indices {
            let a = list[i]
            let at = ringTime(a)
            guard at > now + 500 else { continue }
            let wanted = wantedBooking(for: a, at: at)
            if a.booked == wanted { 
                if wanted == "alarmkit", FileManager.default.fileExists(atPath: SoundFiles.folder.appendingPathComponent(SpeechFiles.fileName(for: spokenWords(a))).path) {
                    spokenNames.insert(SpeechFiles.fileName(for: spokenWords(a)))
                }
                continue
            }
            unbook(a)
            var speakFile = ""
            if wanted == "alarmkit", SoundFiles.alarmSoundIsSpoken(), a.soundUrl.isEmpty, spokenBudget > 0,
               upcoming.prefix(spokenLimit).contains(where: { $0.id == a.id }) {
                spokenBudget -= 1
                let words = spokenWords(a)
                let done = DispatchSemaphore(value: 0)
                var rendered: String?
                SpeechFiles.shared.render(words) { rendered = $0; done.signal() }
                _ = done.wait(timeout: .now() + 25)
                speakFile = rendered ?? ""
                if !speakFile.isEmpty { spokenNames.insert(speakFile) }
            }
            switch wanted {
            case "alarmkit":
                list[i].booked = scheduleAlarmKit(a, at: at, spokenFile: speakFile) ? "alarmkit" : (scheduleNotification(a, at: at, quiet: false) ? "notification" : "")
            case "notification":
                list[i].booked = scheduleNotification(a, at: at, quiet: false) ? "notification" : ""
            default:
                list[i].booked = scheduleNotification(a, at: at, quiet: true) ? "quiet" : ""
            }
            changed = true
        }
        if changed { SharedStore.saveAlarms(list) }
        SpeechFiles.shared.keepOnly(spokenNames)
    }

    private func replanAll() {
        // Everything is re-judged: a booking that no longer matches is redone in bookAll.
        var list = SharedStore.alarms()
        for i in list.indices {
            let at = ringTime(list[i])
            if list[i].booked != "" && list[i].booked != wantedBooking(for: list[i], at: at) {
                unbook(list[i])
                list[i].booked = ""
            }
        }
        SharedStore.saveAlarms(list)
        bookAll()
    }

    /// What the voice says for this alarm: the heading, then the body.
    private func spokenWords(_ a: StoredAlarm) -> String {
        let head = a.spokenTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = a.body.trimmingCharacters(in: .whitespacesAndNewlines)
        if body.isEmpty { return head }
        return head.isEmpty ? body : "\(head). \(body)"
    }

    private func unbook(_ a: StoredAlarm) {
        center.removePendingNotificationRequests(withIdentifiers: ["alarm:\(a.id)"])
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *), a.booked == "alarmkit" || a.booked == "" {
            try? AlarmManager.shared.cancel(id: AlarmIds.uuid(for: a.id))
        }
        #endif
    }

    /// The alarm as a notification of the phone's own: the alarm sound (or
    /// none, quietly) and the alarm's buttons. True when booked.
    private func scheduleNotification(_ a: StoredAlarm, at ms: Double, quiet: Bool) -> Bool {
        let date = Date(timeIntervalSince1970: ms / 1000)
        let content = UNMutableNotificationContent()
        content.title = a.spokenTitle.isEmpty ? "ADHDone" : a.spokenTitle
        content.body = a.body
        content.categoryIdentifier = a.event ? ReminderCategory.eventAlarm : ReminderCategory.alarm
        var data: [String: Any] = [
            "taskId": a.taskId,
            "alarmId": a.id,
            "type": a.event ? "event_reminder" : "task_reminder",
            "alarm": true
        ]
        if !a.screen.isEmpty { data["screen"] = a.screen }
        content.userInfo = ["adhdone": data]
        if !a.taskId.isEmpty { content.threadIdentifier = "task:\(a.taskId)" }
        if quiet {
            content.sound = nil
            content.interruptionLevel = .passive
        } else {
            let file = SoundFiles.alarmSoundFile()
            content.sound = file.isEmpty ? .default : UNNotificationSound(named: UNNotificationSoundName(file))
        }
        let seconds = max(1, date.timeIntervalSinceNow)
        let request = UNNotificationRequest(identifier: "alarm:\(a.id)", content: content,
                                            trigger: UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false))
        let done = DispatchSemaphore(value: 0)
        var ok = false
        center.add(request) { error in ok = (error == nil); done.signal() }
        _ = done.wait(timeout: .now() + 5)
        return ok
    }

    /// A real AlarmKit alarm. False when AlarmKit refused (then the caller
    /// books a notification instead).
    private func scheduleAlarmKit(_ a: StoredAlarm, at ms: Double, spokenFile: String) -> Bool {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            let date = Date(timeIntervalSince1970: ms / 1000)
            let id = AlarmIds.uuid(for: a.id)
            let theme = SharedStore.read(.theme, as: AlarmTheme.self) ?? AlarmTheme()
            let tint = Color(hex: theme.accent) ?? .purple
            let stop = AlarmButton(text: LocalizedStringResource(stringLiteral: a.event ? "Got it" : "Stop"),
                                   textColor: .white, systemImageName: a.event ? "checkmark" : "stop.fill")
            var secondary: AlarmButton?
            var behavior: AlarmPresentation.Alert.SecondaryButtonBehavior?
            var secondaryIntent: (any LiveActivityIntent)?
            var countdown: Alarm.CountdownDuration?
            var presentation: AlarmPresentation
            let openPath = a.screen.isEmpty ? (a.taskId.isEmpty ? "" : "/TaskNotification?taskId=\(a.taskId)&from=alarm") : a.screen
            let ownActions = AlarmEngine.firstAction(a.actions)
            if let act = ownActions {
                // A timer's own button ("Start the next one", "Open the task"): opens the app there.
                secondary = AlarmButton(text: LocalizedStringResource(stringLiteral: act.label), textColor: .white, systemImageName: "arrow.up.right.square")
                behavior = .custom
                secondaryIntent = AlarmOpenIntent(alarmID: id.uuidString, alarmKey: a.id, taskId: a.taskId, path: act.path)
                presentation = AlarmPresentation(alert: AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: a.spokenTitle.isEmpty ? "ADHDone" : a.spokenTitle), stopButton: stop, secondaryButton: secondary, secondaryButtonBehavior: behavior))
            } else if !a.event && !a.noSnooze {
                // A task's alarm: Snooze 10 min runs as a countdown and rings again.
                secondary = AlarmButton(text: "Snooze 10 min", textColor: .white, systemImageName: "zzz")
                behavior = .countdown
                countdown = Alarm.CountdownDuration(preAlert: nil, postAlert: TimeInterval(ReminderCategory.snoozeMinutes * 60))
                secondaryIntent = AlarmSnoozeIntent(alarmID: id.uuidString, alarmKey: a.id, taskId: a.taskId)
                let alert = AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: a.spokenTitle.isEmpty ? "ADHDone" : a.spokenTitle), stopButton: stop, secondaryButton: secondary, secondaryButtonBehavior: behavior)
                let countdownView = AlarmPresentation.Countdown(title: "Snoozed", pauseButton: nil)
                let paused = AlarmPresentation.Paused(title: "Paused", resumeButton: AlarmButton(text: "Resume", textColor: .white, systemImageName: "play.fill"))
                presentation = AlarmPresentation(alert: alert, countdown: countdownView, paused: paused)
            } else if !a.openLabel.isEmpty, !openPath.isEmpty {
                // An event with something to do in the app ("Add prep notes", "Send a text").
                secondary = AlarmButton(text: LocalizedStringResource(stringLiteral: a.openLabel), textColor: .white, systemImageName: "arrow.up.right.square")
                behavior = .custom
                secondaryIntent = AlarmOpenIntent(alarmID: id.uuidString, alarmKey: a.id, taskId: a.taskId, path: openPath)
                presentation = AlarmPresentation(alert: AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: a.spokenTitle.isEmpty ? "ADHDone" : a.spokenTitle), stopButton: stop, secondaryButton: secondary, secondaryButtonBehavior: behavior))
            } else {
                presentation = AlarmPresentation(alert: AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: a.spokenTitle.isEmpty ? "ADHDone" : a.spokenTitle), stopButton: stop))
            }
            let metadata = ADHDoneAlarmMetadata(alarmId: a.id, taskId: a.taskId, title: a.spokenTitle, body: a.body,
                                                event: a.event, openLabel: a.openLabel, screen: openPath)
            let attributes = AlarmAttributes(presentation: presentation, metadata: metadata, tintColor: tint)
            // The sound: a timer's own (already a file when the web app gave an
            // address the app has), the spoken sentence, the chosen alarm sound,
            // or the phone's own. Named WITH its extension (the iOS 26.5 fix).
            var sound: AlertConfiguration.AlertSound = .default
            if !spokenFile.isEmpty {
                sound = .named(spokenFile)
            } else if !a.soundUrl.isEmpty, let own = SoundFiles.ownSoundFile(for: a.soundUrl) {
                sound = .named(own)
            } else {
                let file = SoundFiles.alarmSoundFile()
                if !file.isEmpty { sound = .named(file) }
            }
            let config = AlarmManager.AlarmConfiguration(
                countdownDuration: countdown,
                schedule: .fixed(date),
                attributes: attributes,
                stopIntent: AlarmStopIntent(alarmID: id.uuidString, alarmKey: a.id, taskId: a.taskId),
                secondaryIntent: secondaryIntent,
                sound: sound)
            let done = DispatchSemaphore(value: 0)
            let outcome = ResultBox(false)
            Task {
                do {
                    _ = try await AlarmManager.shared.schedule(id: id, configuration: config)
                    outcome.value = true
                } catch {
                    NSLog("[AlarmEngine] AlarmKit refused \(a.id): \(error)")
                }
                done.signal()
            }
            _ = done.wait(timeout: .now() + 10)
            return outcome.value
        }
        #endif
        return false
    }

    /// The first button of a timer's own alarm ([{label, path}] JSON).
    private static func firstAction(_ json: String) -> (label: String, path: String)? {
        guard !json.isEmpty, let data = json.data(using: .utf8),
              let list = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]],
              let first = list.first, let label = first["label"] as? String, !label.isEmpty else { return nil }
        return (label, (first["path"] as? String) ?? "")
    }
}

extension SoundFiles {
    /// A timer's own sound (bookOwn soundUrl), as a file when the app has
    /// already fetched it; nil otherwise (then the alarm sound is used).
    static func ownSoundFile(for url: String) -> String? {
        let file = "sound_\(hash(url)).caf"
        return FileManager.default.fileExists(atPath: folder.appendingPathComponent(file).path) ? file : nil
    }

    /// Fetches a timer's own sound in the background so the NEXT time it rings
    /// it has it (the first ring falls back to the alarm sound).
    static func prefetch(url: String) {
        guard !url.isEmpty, url != "speak:", let remote = URL(string: url) else { return }
        let dest = folder.appendingPathComponent("sound_\(hash(url)).caf")
        guard !FileManager.default.fileExists(atPath: dest.path) else { return }
        URLSession.shared.downloadTask(with: remote) { tmp, _, error in
            guard let tmp = tmp, error == nil else { return }
            _ = convertToCAF(from: tmp, to: dest)
        }.resume()
    }
}

/// A value a Task writes and the waiting caller reads (a captured `var` can't
/// be changed inside a Task).
final class ResultBox<T>: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: T
    init(_ value: T) { stored = value }
    var value: T {
        get { lock.lock(); defer { lock.unlock() }; return stored }
        set { lock.lock(); stored = newValue; lock.unlock() }
    }
}

extension Color {
    /// "#RRGGBB" → Color; nil when it isn't one.
    init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        self.init(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }
}
