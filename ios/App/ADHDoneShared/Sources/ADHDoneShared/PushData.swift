import Foundation

/// Reading a OneSignal push, and deciding which buttons it gets. Used by the
/// app (NotifyBridge, the reminder buttons) and by the notification extension
/// (ADHDoneNotify), which sees every push before it shows.
public enum PushData {
    /// The `data` the server put on the push. OneSignal carries it as
    /// userInfo["custom"]["a"] on iPhone; a local copy the app made itself
    /// (a snoozed reminder) carries it as userInfo["adhdone"].
    public static func additionalData(from userInfo: [AnyHashable: Any]) -> [String: Any] {
        if let own = userInfo["adhdone"] as? [String: Any] { return own }
        if let custom = userInfo["custom"] as? [String: Any], let a = custom["a"] as? [String: Any] { return a }
        if let a = userInfo["a"] as? [String: Any] { return a }
        return [:]
    }

    /// OneSignal's own id for the push (userInfo["custom"]["i"]).
    public static func oneSignalId(from userInfo: [AnyHashable: Any]) -> String {
        if let custom = userInfo["custom"] as? [String: Any], let i = custom["i"] as? String { return i }
        return ""
    }

    public static func taskId(_ data: [String: Any]) -> String {
        let id = (data["taskId"] as? String) ?? (data["task_id"] as? String) ?? ""
        return id
    }

    public static func type(_ data: [String: Any]) -> String {
        (data["type"] as? String) ?? ""
    }

    /// Which buttons a push gets, by what it is about (the twin of Android's
    /// TaskActions.buttonsFor): a reminder at a time the person set gets Done
    /// and Snooze; a Smart Reminders nudge Done and Later (the nudges pick their
    /// own times, so a fixed snooze works against them); an event's reminder
    /// only Snooze (an event isn't something you finish early); an
    /// appointment's night-before heads-up one button, straight to its
    /// questions page. Birthday, commute, digest and other pushes get none.
    public static func category(for data: [String: Any]) -> String? {
        guard !taskId(data).isEmpty else { return nil }
        switch type(data) {
        case "task_reminder": return ReminderCategory.doneAndSnooze
        case "smart_nudge": return ReminderCategory.doneAndLater
        case "event_reminder": return ReminderCategory.snooze
        case "event_heads_up": return ReminderCategory.writeQuestions
        default: return nil
        }
    }
}

/// The notification categories the app registers at start (ReminderActions)
/// and the extension names on each push. The action ids are what
/// OneSignalInit.jsx (handleNotificationData) and ReminderActions read back.
public enum ReminderCategory {
    public static let doneAndSnooze = "adhdone_done_snooze"
    public static let doneAndLater = "adhdone_done_later"
    public static let snooze = "adhdone_snooze"
    public static let writeQuestions = "adhdone_questions"
    /// A full-screen alarm shown as a notification instead (silenced, during an
    /// event, or on an iPhone without AlarmKit): Done, Snooze 10 min, Later.
    public static let alarm = "adhdone_alarm"
    /// An event's alarm as a notification: Got it only.
    public static let eventAlarm = "adhdone_alarm_event"

    public static let actionDone = "done"
    public static let actionSnooze = "snooze_10"
    public static let actionLater = "later"
    public static let actionQuestions = "questions"
    public static let actionGotIt = "got_it"

    public static let snoozeMinutes = 10
}
