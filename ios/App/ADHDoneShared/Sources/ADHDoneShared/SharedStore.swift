import Foundation
import Security

// The iPhone app's small shared memory: what the app, the widget and the
// notification extension all need to read or write. The alarms the phone
// holds, the widget's task list, the sounds chosen, whether ADHDone is
// silenced, the choices made on alarms and reminders that the web app collects
// later (AlarmBridge.drainActivity), and "what rang".
//
// Kept in the keychain group every target can open (the same group the share
// extension uses for the sign-in, SharedSession). An App Group would be the
// usual way, but it has to be switched on for the identifier in Apple's
// developer portal and the profiles made again, which only Anna can do;
// keychain groups come with every profile, and the share extension has proved
// them on this account since Oct 31 2026. Each entry is one small JSON blob,
// readable once the phone has been unlocked once since it started.
//
// Android keeps the same things in SharedPreferences (AlarmStore, WidgetData,
// NotifySound, ReminderPause, RingLog, ChoiceReports).

/// One alarm the phone holds (the twin of Android's AlarmStore.Entry).
public struct StoredAlarm: Codable, Equatable {
    public var id: String
    public var taskId: String
    public var title: String
    public var heading: String
    public var body: String
    /// When it rings, ms since 1970.
    public var at: Double
    /// An event's alarm: Stop only, no snooze.
    public var event: Bool
    /// A time the person set themselves: rings inside quiet hours too.
    public var theirTime: Bool
    public var throughQuiet: Bool
    public var family: String
    /// What the second button says when it opens the app ("Add prep notes", "Send a text").
    public var openLabel: String
    /// Where the app opens from this alarm ("" = the task's own page).
    public var screen: String
    public var noSnooze: Bool
    /// A sound of its own (timers), as the web app gave it.
    public var soundUrl: String
    /// Buttons of its own, JSON [{label, path}] (timers).
    public var actions: String
    /// Booked with bookOwn (a timer's end, a push's alarm): the task sync leaves it alone.
    public var own: Bool
    /// How the phone holds it right now: "alarmkit", "notification" or "" (not booked).
    public var booked: String
    /// A snooze that is running, ms since 1970 (0 = none).
    public var snoozedUntil: Double

    public init(id: String, taskId: String = "", title: String = "ADHDone", heading: String = "", body: String = "",
                at: Double, event: Bool = false, theirTime: Bool = false, throughQuiet: Bool = false,
                family: String = "", openLabel: String = "", screen: String = "", noSnooze: Bool = false,
                soundUrl: String = "", actions: String = "", own: Bool = false, booked: String = "",
                snoozedUntil: Double = 0) {
        self.id = id
        self.taskId = taskId
        self.title = title
        self.heading = heading
        self.body = body
        self.at = at
        self.event = event
        self.theirTime = theirTime
        self.throughQuiet = throughQuiet
        self.family = family
        self.openLabel = openLabel
        self.screen = screen
        self.noSnooze = noSnooze
        self.soundUrl = soundUrl
        self.actions = actions
        self.own = own
        self.booked = booked
        self.snoozedUntil = snoozedUntil
    }

    // Older saved copies may lack newer fields: read what is there.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        taskId = try c.decodeIfPresent(String.self, forKey: .taskId) ?? ""
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? "ADHDone"
        heading = try c.decodeIfPresent(String.self, forKey: .heading) ?? ""
        body = try c.decodeIfPresent(String.self, forKey: .body) ?? ""
        at = try c.decodeIfPresent(Double.self, forKey: .at) ?? 0
        event = try c.decodeIfPresent(Bool.self, forKey: .event) ?? false
        theirTime = try c.decodeIfPresent(Bool.self, forKey: .theirTime) ?? false
        throughQuiet = try c.decodeIfPresent(Bool.self, forKey: .throughQuiet) ?? false
        family = try c.decodeIfPresent(String.self, forKey: .family) ?? ""
        openLabel = try c.decodeIfPresent(String.self, forKey: .openLabel) ?? ""
        screen = try c.decodeIfPresent(String.self, forKey: .screen) ?? ""
        noSnooze = try c.decodeIfPresent(Bool.self, forKey: .noSnooze) ?? false
        soundUrl = try c.decodeIfPresent(String.self, forKey: .soundUrl) ?? ""
        actions = try c.decodeIfPresent(String.self, forKey: .actions) ?? ""
        own = try c.decodeIfPresent(Bool.self, forKey: .own) ?? false
        booked = try c.decodeIfPresent(String.self, forKey: .booked) ?? ""
        snoozedUntil = try c.decodeIfPresent(Double.self, forKey: .snoozedUntil) ?? 0
    }

    /// The words the alarm says: the heading when there is one, else the title.
    public var spokenTitle: String { heading.isEmpty ? title : heading }
}

/// One row of the widget's list (WidgetBridge.updateTasks, from widgetBridge.js).
public struct WidgetTask: Codable, Equatable, Identifiable {
    public var id: String
    public var title: String
    public var time: String
    public var urgency: String
    public init(id: String, title: String, time: String = "", urgency: String = "medium") {
        self.id = id
        self.title = title
        self.time = time
        self.urgency = urgency
    }
}

public struct WidgetPayload: Codable, Equatable {
    public var generatedFor: String
    public var heading: String
    public var tasks: [WidgetTask]
    /// When the app last handed this over, ms since 1970.
    public var updatedAt: Double
    public init(generatedFor: String = "", heading: String = "", tasks: [WidgetTask] = [], updatedAt: Double = Date().timeIntervalSince1970 * 1000) {
        self.generatedFor = generatedFor
        self.heading = heading
        self.tasks = tasks
        self.updatedAt = updatedAt
    }
}

/// A sound the person picked (AlarmBridge.setSound / setNotifySound).
public struct SoundChoice: Codable, Equatable {
    /// The address the web app gave ("" = the phone's own sound, "speak:" = read it aloud).
    public var url: String
    public var name: String
    /// The converted copy in the app's Library/Sounds folder ("" = none yet).
    public var file: String
    public var speak: Bool
    /// For the notification sound: the voice stays quiet inside quiet hours.
    public var quietOn: Bool
    public var quietStart: String
    public var quietEnd: String
    public init(url: String = "", name: String = "", file: String = "", speak: Bool = false,
                quietOn: Bool = true, quietStart: String = "22:00", quietEnd: String = "08:00") {
        self.url = url
        self.name = name
        self.file = file
        self.speak = speak
        self.quietOn = quietOn
        self.quietStart = quietStart
        self.quietEnd = quietEnd
    }
}

/// A calendar event's span (AlarmBridge.setEventWindows), ms since 1970.
public struct EventWindow: Codable, Equatable {
    public var start: Double
    public var end: Double
    public init(start: Double, end: Double) {
        self.start = start
        self.end = end
    }
}

/// What happened on this phone to one task's alarms and reminders since the
/// web app last asked (the shape widgetBridge.drainAlarmActivity reads).
public struct ActivityRow: Codable, Equatable {
    public var taskId: String
    public var snoozes: Int
    public var snoozedUntil: Double
    public var dismissed: Bool
    public var ignored: Int
    public var later: Int
    public init(taskId: String, snoozes: Int = 0, snoozedUntil: Double = 0, dismissed: Bool = false, ignored: Int = 0, later: Int = 0) {
        self.taskId = taskId
        self.snoozes = snoozes
        self.snoozedUntil = snoozedUntil
        self.dismissed = dismissed
        self.ignored = ignored
        self.later = later
    }
}

/// One line of "What rang" (Settings → Notifications; AlarmBridge.ringLog).
public struct RingRow: Codable, Equatable {
    public var at: Double
    public var taskId: String
    public var title: String
    public var body: String
    /// "alarm" (a full-screen alarm), "notification" (a push with sound), "quiet".
    public var kind: String
    /// How it ended: "snoozed", "dismissed", "later", "done", "rang_out", "" (still open).
    public var outcome: String
    public init(at: Double, taskId: String, title: String, body: String, kind: String, outcome: String = "") {
        self.at = at
        self.taskId = taskId
        self.title = title
        self.body = body
        self.kind = kind
        self.outcome = outcome
    }
}

/// A task finished or deleted lately: a reminder about it that still lands is
/// not shown (the twin of Android's TaskPushes).
public struct FinishedTask: Codable, Equatable {
    public var taskId: String
    public var at: Double
    public init(taskId: String, at: Double) {
        self.taskId = taskId
        self.at = at
    }
}

/// The app's colours, for the alarm's Live Activity (AlarmBridge.setTheme).
public struct AlarmTheme: Codable, Equatable {
    public var background: String
    public var accent: String
    public var text: String
    public init(background: String = "#1F1B2E", accent: String = "#8B5CF6", text: String = "#FFFFFF") {
        self.background = background
        self.accent = accent
        self.text = text
    }
}

public enum SharedStore {
    public enum Key: String, CaseIterable {
        case alarms            // [StoredAlarm]
        case activeTaskIds     // [String]: active, unsilenced tasks at the last sync
        case finishedTasks     // [FinishedTask]
        case widgetTasks       // WidgetPayload
        case alarmSound        // SoundChoice
        case notifySound       // SoundChoice
        case quietUntil        // Double, ms: ADHDone silenced until then (0 = not)
        case eventQuiet        // Bool: silent alarms during calendar events
        case eventWindows      // [EventWindow]
        case activity          // [ActivityRow]
        case ringLog           // [RingRow]
        case widgetOpen        // String: the path a widget tap asked for
        case theme             // AlarmTheme
        case quietEnd          // String "HH:MM": their morning
        case pendingRemovals   // [String]: push ids the extension could not take down itself
        case laterUntil        // [String: Double]: taskId → break end, ms
    }

    private static let service = "com.mediocreatbest.adhdone.store"
    private static let lock = NSLock()

    // MARK: - Reading and writing

    public static func read<T: Decodable>(_ key: Key, as type: T.Type) -> T? {
        guard let data = readData(account: key.rawValue) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    @discardableResult
    public static func write<T: Encodable>(_ key: Key, _ value: T) -> Bool {
        guard let data = try? JSONEncoder().encode(value) else { return false }
        return writeData(account: key.rawValue, data: data)
    }

    public static func remove(_ key: Key) {
        deleteData(account: key.rawValue)
    }

    // MARK: - Alarms

    public static func alarms() -> [StoredAlarm] {
        read(.alarms, as: [StoredAlarm].self) ?? []
    }

    public static func saveAlarms(_ list: [StoredAlarm]) {
        write(.alarms, list)
    }

    public static func alarm(id: String) -> StoredAlarm? {
        alarms().first { $0.id == id }
    }

    public static func update(alarmId: String, _ change: (inout StoredAlarm) -> Void) {
        lock.lock(); defer { lock.unlock() }
        var list = alarms()
        guard let i = list.firstIndex(where: { $0.id == alarmId }) else { return }
        change(&list[i])
        saveAlarms(list)
    }

    // MARK: - Silence (1 / 2 / 3 hours)

    public static var quietUntilMs: Double {
        get { read(.quietUntil, as: Double.self) ?? 0 }
        set { write(.quietUntil, newValue) }
    }

    public static func isQuietNow(_ now: Date = Date()) -> Bool {
        quietUntilMs > now.timeIntervalSince1970 * 1000
    }

    // MARK: - Calendar events ("Silent alarms during events?")

    public static var eventQuiet: Bool {
        get { read(.eventQuiet, as: Bool.self) ?? false }
        set { write(.eventQuiet, newValue) }
    }

    public static func eventWindows() -> [EventWindow] {
        read(.eventWindows, as: [EventWindow].self) ?? []
    }

    /// True while a calendar event is happening at that moment AND the person
    /// asked for silent alarms during events.
    public static func quietForEvent(at ms: Double) -> Bool {
        guard eventQuiet else { return false }
        return eventWindows().contains { $0.start <= ms && ms < $0.end }
    }

    // MARK: - Finished tasks

    public static func markFinished(taskId: String, at ms: Double = Date().timeIntervalSince1970 * 1000) {
        guard !taskId.isEmpty else { return }
        lock.lock(); defer { lock.unlock() }
        let cutoff = Date().timeIntervalSince1970 * 1000 - 7 * 24 * 3600 * 1000
        var list = (read(.finishedTasks, as: [FinishedTask].self) ?? []).filter { $0.at > cutoff && $0.taskId != taskId }
        list.append(FinishedTask(taskId: taskId, at: ms))
        if list.count > 300 { list = Array(list.suffix(300)) }
        write(.finishedTasks, list)
    }

    /// Back on the list (un-finished, or the sync says it is active): its reminders show again.
    public static func unmarkFinished(taskIds: [String]) {
        guard !taskIds.isEmpty else { return }
        lock.lock(); defer { lock.unlock() }
        let gone = Set(taskIds)
        let list = read(.finishedTasks, as: [FinishedTask].self) ?? []
        let kept = list.filter { !gone.contains($0.taskId) }
        if kept.count != list.count { write(.finishedTasks, kept) }
    }

    /// Finished or deleted in the last day: a reminder about it is stale. A day,
    /// not longer, so a task put back on the list from the web while the phone
    /// app was closed (which no sync has told the phone about yet) isn't kept
    /// quiet for long.
    public static func finishedRecently(taskId: String, now: Date = Date()) -> Bool {
        guard !taskId.isEmpty else { return false }
        let cutoff = now.timeIntervalSince1970 * 1000 - 24 * 3600 * 1000
        return (read(.finishedTasks, as: [FinishedTask].self) ?? []).contains { $0.taskId == taskId && $0.at > cutoff }
    }

    // MARK: - Choices for the web app

    public static func addActivity(taskId: String, _ change: (inout ActivityRow) -> Void) {
        guard !taskId.isEmpty else { return }
        lock.lock(); defer { lock.unlock() }
        var list = read(.activity, as: [ActivityRow].self) ?? []
        if let i = list.firstIndex(where: { $0.taskId == taskId }) {
            change(&list[i])
        } else {
            var row = ActivityRow(taskId: taskId)
            change(&row)
            list.append(row)
        }
        write(.activity, list)
    }

    /// Hands every waiting row over and starts again from nothing.
    public static func drainActivity() -> [ActivityRow] {
        lock.lock(); defer { lock.unlock() }
        let list = read(.activity, as: [ActivityRow].self) ?? []
        remove(.activity)
        return list
    }

    // MARK: - What rang

    public static func logRing(_ row: RingRow) {
        lock.lock(); defer { lock.unlock() }
        let cutoff = Date().timeIntervalSince1970 * 1000 - 7 * 24 * 3600 * 1000
        var list = (read(.ringLog, as: [RingRow].self) ?? []).filter { $0.at > cutoff }
        list.append(row)
        if list.count > 200 { list = Array(list.suffix(200)) }
        write(.ringLog, list)
    }

    /// Writes how the newest open ring of this task ended.
    public static func settleRing(taskId: String, outcome: String) {
        lock.lock(); defer { lock.unlock() }
        var list = read(.ringLog, as: [RingRow].self) ?? []
        guard let i = list.lastIndex(where: { $0.taskId == taskId && $0.outcome.isEmpty }) else { return }
        list[i].outcome = outcome
        write(.ringLog, list)
    }

    public static func ringLog(days: Int) -> [RingRow] {
        let cutoff = Date().timeIntervalSince1970 * 1000 - Double(max(1, days)) * 24 * 3600 * 1000
        return (read(.ringLog, as: [RingRow].self) ?? []).filter { $0.at > cutoff }.sorted { $0.at > $1.at }
    }

    // MARK: - Pushes the extension could not take down itself

    public static func addPendingRemoval(_ requestId: String) {
        guard !requestId.isEmpty else { return }
        lock.lock(); defer { lock.unlock() }
        var list = read(.pendingRemovals, as: [String].self) ?? []
        if !list.contains(requestId) { list.append(requestId) }
        if list.count > 100 { list = Array(list.suffix(100)) }
        write(.pendingRemovals, list)
    }

    public static func takePendingRemovals() -> [String] {
        lock.lock(); defer { lock.unlock() }
        let list = read(.pendingRemovals, as: [String].self) ?? []
        remove(.pendingRemovals)
        return list
    }

    // MARK: - Keychain

    private static func baseQuery(account: String) -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: SharedSession.accessGroup
        ]
    }

    private static func readData(account: String) -> Data? {
        var query = baseQuery(account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        return status == errSecSuccess ? result as? Data : nil
    }

    @discardableResult
    private static func writeData(account: String, data: Data) -> Bool {
        let query = baseQuery(account: account)
        let update: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecSuccess { return true }
        if status != errSecItemNotFound { return false }
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }

    private static func deleteData(account: String) {
        SecItemDelete(baseQuery(account: account) as CFDictionary)
    }
}

/// "HH:MM" quiet hours, judged in the phone's own zone (the same window the
/// web app keeps in localStorage and the server in User.quiet_hours_*).
public enum QuietHours {
    public static func isInside(_ date: Date, start: String, end: String) -> Bool {
        guard let s = minutes(start), let e = minutes(end), s != e else { return false }
        let cal = Calendar.current
        let m = cal.component(.hour, from: date) * 60 + cal.component(.minute, from: date)
        if s < e { return m >= s && m < e }
        return m >= s || m < e
    }

    static func minutes(_ hhmm: String) -> Int? {
        let parts = hhmm.split(separator: ":")
        guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]) else { return nil }
        return h * 60 + m
    }
}
