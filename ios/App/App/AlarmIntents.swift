import Foundation
import AppIntents
import ADHDoneShared
#if canImport(AlarmKit)
import AlarmKit
#endif

// The buttons on an AlarmKit alarm (iOS 26+): what each one does when tapped.
// AlarmKit runs these in the app, even while it is closed (LiveActivityIntent),
// so a Stop, a Snooze or an Open on the lock screen is recorded here the way
// Android's AlarmActivity records its choices — the web app collects them
// through AlarmBridge.drainActivity. None are offered in Shortcuts or Siri.

#if canImport(AlarmKit)
@available(iOS 26.0, *)
struct AlarmStopIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Stop the alarm"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Alarm") var alarmID: String
    @Parameter(title: "Alarm key") var alarmKey: String
    @Parameter(title: "Task") var taskId: String

    init() {
        alarmID = ""
        alarmKey = ""
        taskId = ""
    }

    init(alarmID: String, alarmKey: String, taskId: String) {
        self.alarmID = alarmID
        self.alarmKey = alarmKey
        self.taskId = taskId
    }

    func perform() async throws -> some IntentResult {
        if let id = UUID(uuidString: alarmID) { try? AlarmManager.shared.stop(id: id) }
        SharedStore.settleRing(taskId: taskId, outcome: "dismissed")
        AlarmEngine.shared.answered(alarmId: alarmKey, outcome: "dismissed")
        return .result()
    }
}

/// "Snooze 10 min": AlarmKit itself runs the countdown and rings again; this
/// only writes down that it happened (snooze_count, snoozed_until).
@available(iOS 26.0, *)
struct AlarmSnoozeIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Snooze the alarm"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Alarm") var alarmID: String
    @Parameter(title: "Alarm key") var alarmKey: String
    @Parameter(title: "Task") var taskId: String

    init() {
        alarmID = ""
        alarmKey = ""
        taskId = ""
    }

    init(alarmID: String, alarmKey: String, taskId: String) {
        self.alarmID = alarmID
        self.alarmKey = alarmKey
        self.taskId = taskId
    }

    func perform() async throws -> some IntentResult {
        if let id = UUID(uuidString: alarmID) { try? AlarmManager.shared.countdown(id: id) }
        let until = Date().timeIntervalSince1970 * 1000 + Double(ReminderCategory.snoozeMinutes * 60 * 1000)
        SharedStore.addActivity(taskId: taskId) {
            $0.snoozes += 1
            $0.snoozedUntil = until
        }
        SharedStore.settleRing(taskId: taskId, outcome: "snoozed \(ReminderCategory.snoozeMinutes) min")
        SharedStore.update(alarmId: alarmKey) { $0.snoozedUntil = until }
        return .result()
    }
}

/// The second button that opens the app somewhere ("Add prep notes", "Send a
/// text", a timer's own button): stops the ring and leaves the path for the app
/// to open (WidgetBridge delivers it, the same way a widget tap is delivered).
@available(iOS 26.0, *)
struct AlarmOpenIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Open in ADHDone"
    static var isDiscoverable: Bool = false
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Alarm") var alarmID: String
    @Parameter(title: "Alarm key") var alarmKey: String
    @Parameter(title: "Task") var taskId: String
    @Parameter(title: "Path") var path: String

    init() {
        alarmID = ""
        alarmKey = ""
        taskId = ""
        path = ""
    }

    init(alarmID: String, alarmKey: String, taskId: String, path: String) {
        self.alarmID = alarmID
        self.alarmKey = alarmKey
        self.taskId = taskId
        self.path = path
    }

    func perform() async throws -> some IntentResult {
        if let id = UUID(uuidString: alarmID) { try? AlarmManager.shared.stop(id: id) }
        SharedStore.settleRing(taskId: taskId, outcome: "opened")
        AlarmEngine.shared.answered(alarmId: alarmKey, outcome: "opened")
        if !path.isEmpty { WidgetBridge.deliverPath(path) }
        return .result()
    }
}
#endif
