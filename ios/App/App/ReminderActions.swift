import Foundation
import UIKit
import UserNotifications
import ADHDoneNative
import ADHDoneShared

/// The buttons on a reminder, and what they do (the twin of Android's
/// TaskActions / TaskActionReceiver). Nov 4 2026.
///
/// The notification extension (ADHDoneNotify) names a category on each push by
/// what it is about (PushData.category); the categories themselves are
/// registered here when the app starts, so iOS knows which buttons each one
/// has. A tap on a button comes back through OneSignal's click listener
/// (NotifyBridge.actionHandler) or, for the app's own notifications (a snoozed
/// copy, an alarm shown as a notification), through LocalNotifications below.
///
///  - Done opens the task's page with done=1, which finishes it there exactly
///    like the page's own Done button (OneSignalInit.jsx reads data.actionId).
///  - Snooze 10 min brings the same reminder back in 10 minutes as a
///    notification of the phone's own, same buttons, without opening the app.
///    While ADHDone is silenced the snoozed one comes back quietly too.
///  - Later takes the notification away without opening the app and books
///    nothing: the task stays active, so Smart Reminders brings it up again at
///    a time it picks. Counted here and collected by the web app through
///    AlarmBridge.drainActivity as the task's later_count (and its break).
///  - Write questions (an appointment's night-before) opens the Notes page's
///    questions for that appointment.
///  - Got it (an event's alarm shown as a notification) only takes it away.
enum ReminderActions {

    static func registerCategories() {
        let done = UNNotificationAction(identifier: ReminderCategory.actionDone, title: "Done", options: [.foreground])
        let snooze = UNNotificationAction(identifier: ReminderCategory.actionSnooze, title: "Snooze \(ReminderCategory.snoozeMinutes) min", options: [])
        let later = UNNotificationAction(identifier: ReminderCategory.actionLater, title: "Later", options: [])
        let questions = UNNotificationAction(identifier: ReminderCategory.actionQuestions, title: "Write questions", options: [.foreground])
        let gotIt = UNNotificationAction(identifier: ReminderCategory.actionGotIt, title: "Got it", options: [])
        let categories: Set<UNNotificationCategory> = [
            UNNotificationCategory(identifier: ReminderCategory.doneAndSnooze, actions: [done, snooze], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: ReminderCategory.doneAndLater, actions: [done, later], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: ReminderCategory.snooze, actions: [snooze], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: ReminderCategory.writeQuestions, actions: [questions], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: ReminderCategory.alarm, actions: [done, snooze, later], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: ReminderCategory.eventAlarm, actions: [gotIt], intentIdentifiers: [], options: [])
        ]
        UNUserNotificationCenter.current().setNotificationCategories(categories)
    }

    /// A button was tapped on a push or one of the app's notifications. Returns
    /// true when it was answered here, with the app staying closed; false when
    /// the web layer takes it (Done, Write questions, a plain tap).
    static func handle(actionId: String, data: [String: Any], title: String, body: String) -> Bool {
        let taskId = PushData.taskId(data)
        switch actionId {
        case ReminderCategory.actionSnooze:
            snooze(data: data, title: title, body: body)
            return true
        case ReminderCategory.actionLater:
            if !taskId.isEmpty {
                SharedStore.addActivity(taskId: taskId) { $0.later += 1 }
                SharedStore.settleRing(taskId: taskId, outcome: "later")
                // An alarm shown as a notification: its snooze copies go too.
                if let alarmId = data["alarmId"] as? String, !alarmId.isEmpty {
                    AlarmEngine.shared.answered(alarmId: alarmId, outcome: "later")
                }
            }
            return true
        case ReminderCategory.actionGotIt:
            if !taskId.isEmpty { SharedStore.settleRing(taskId: taskId, outcome: "dismissed") }
            if let alarmId = data["alarmId"] as? String, !alarmId.isEmpty {
                AlarmEngine.shared.answered(alarmId: alarmId, outcome: "dismissed")
            }
            return true
        default:
            // Done, Write questions, or the push itself: the app opens and the
            // web layer finishes it (handleNotificationData in OneSignalInit.jsx).
            if actionId == ReminderCategory.actionDone, !taskId.isEmpty {
                SharedStore.settleRing(taskId: taskId, outcome: "done")
            }
            return false
        }
    }

    /// The same reminder again in 10 minutes, as a notification of the phone's own.
    private static func snooze(data: [String: Any], title: String, body: String) {
        let taskId = PushData.taskId(data)
        let minutes = ReminderCategory.snoozeMinutes
        let fireAt = Date(timeIntervalSinceNow: TimeInterval(minutes * 60))
        if !taskId.isEmpty {
            SharedStore.addActivity(taskId: taskId) {
                $0.snoozes += 1
                $0.snoozedUntil = fireAt.timeIntervalSince1970 * 1000
            }
            SharedStore.settleRing(taskId: taskId, outcome: "snoozed \(minutes) min")
        }
        // An alarm shown as a notification snoozes through the alarm engine, so
        // it comes back the way an alarm would (AlarmKit when it can).
        if let alarmId = data["alarmId"] as? String, !alarmId.isEmpty {
            AlarmEngine.shared.snooze(alarmId: alarmId, minutes: minutes)
            return
        }
        var copy = data
        copy["snoozed"] = true
        let content = UNMutableNotificationContent()
        content.title = title.isEmpty ? "ADHDone" : title
        content.body = body
        content.userInfo = ["adhdone": copy]
        content.categoryIdentifier = PushData.category(for: data) ?? ReminderCategory.snooze
        if !taskId.isEmpty { content.threadIdentifier = "task:\(taskId)" }
        content.sound = SoundFiles.notificationSound(at: fireAt)
        let request = UNNotificationRequest(
            identifier: "snooze:\(taskId.isEmpty ? UUID().uuidString : taskId):\(Int(fireAt.timeIntervalSince1970))",
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(minutes * 60), repeats: false))
        UNUserNotificationCenter.current().add(request) { _ in }
    }

    /// A task is finished or gone: its snoozed copies and any alarm-as-notification go too.
    static func cancelPending(taskId: String) {
        guard !taskId.isEmpty else { return }
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { requests in
            let ids = requests.filter { PushData.taskId(PushData.additionalData(from: $0.content.userInfo)) == taskId }.map { $0.identifier }
            if !ids.isEmpty { center.removePendingNotificationRequests(withIdentifiers: ids) }
        }
        center.getDeliveredNotifications { list in
            let ids = list.filter { PushData.taskId(PushData.additionalData(from: $0.request.content.userInfo)) == taskId }.map { $0.request.identifier }
            if !ids.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
        }
    }
}

/// Taps and buttons on the app's OWN notifications (a snoozed reminder, an
/// alarm shown as a notification). OneSignal's own pushes never reach this:
/// its SDK takes those first (ClickHandler in NotifyBridge). Set as the
/// notification center's delegate before OneSignal starts, which is the order
/// OneSignal asks for.
final class LocalNotifications: NSObject, UNUserNotificationCenterDelegate {
    static let shared = LocalNotifications()

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let data = PushData.additionalData(from: notification.request.content.userInfo)
        // An alarm of ours going off while the app is open: it still shows, and
        // it is listed under "What rang".
        if (data["alarm"] as? Bool) == true {
            SharedStore.logRing(RingRow(at: Date().timeIntervalSince1970 * 1000, taskId: PushData.taskId(data),
                                        title: notification.request.content.title, body: notification.request.content.body,
                                        kind: notification.request.content.sound == nil ? "quiet" : "notification"))
        }
        completionHandler([.banner, .list, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        // A OneSignal push (its payload carries "custom"): OneSignal's own
        // listener handles the tap and the buttons (ClickHandler in
        // NotifyBridge); if its SDK passes the tap on here as well, it must
        // not be answered a second time (a Snooze twice would make two copies).
        if response.notification.request.content.userInfo["custom"] != nil {
            completionHandler()
            return
        }
        var data = PushData.additionalData(from: response.notification.request.content.userInfo)
        let actionId = response.actionIdentifier
        if actionId != UNNotificationDefaultActionIdentifier && actionId != UNNotificationDismissActionIdentifier {
            data["actionId"] = actionId
            let content = response.notification.request.content
            if ReminderActions.handle(actionId: actionId, data: data, title: content.title, body: content.body) {
                completionHandler()
                return
            }
        }
        if actionId != UNNotificationDismissActionIdentifier, !data.isEmpty {
            NotifyBridge.notificationOpened(data)
        }
        completionHandler()
    }
}
