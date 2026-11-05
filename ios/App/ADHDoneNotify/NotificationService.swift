import UserNotifications
import OneSignalExtension
import ADHDoneShared

/// ADHDoneNotify — sees every push before it shows (the twin of Android's
/// PushFilter). Nov 4 2026. In this order:
///
///  1. A reminder for a task finished, parked or deleted lately (the app wrote
///     it down at its last sync, or the server's "drop" message did): not shown.
///     iOS won't let an extension stop a push outright, so it goes out with
///     nothing in it and no sound — iOS shows nothing for an empty notification
///     — and its id is left for the app to take down from Notification Center
///     on its next open, in case anything did show.
///  2. The buttons: Done + Snooze on a reminder at a time the person set, Done +
///     Later on a Smart Reminders nudge, Snooze on an event's reminder, Write
///     questions on an appointment's night-before (PushData.category; the app
///     registers the categories, ReminderActions).
///  3. The sound: nothing while ADHDone is silenced (the 1 / 2 / 3-hour button)
///     or during a calendar event the person asked quiet for; otherwise the
///     notification sound they picked (a file the app put in Library/Sounds), or
///     the phone's own. "Read it to me" for regular pushes can't be done here
///     (an extension can't speak and can't write to the app's folder), so that
///     choice means the phone's own sound on iPhone.
///  4. Reminders of one task group together in Notification Center.
///
/// OneSignal's own extension code runs last, as its SDK requires.
class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var receivedRequest: UNNotificationRequest?
    private var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.receivedRequest = request
        self.contentHandler = contentHandler
        self.bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)
        guard let content = bestAttemptContent else {
            contentHandler(request.content)
            return
        }

        let data = PushData.additionalData(from: request.content.userInfo)
        let taskId = PushData.taskId(data)

        // 1. Finished already.
        if !taskId.isEmpty, SharedStore.finishedRecently(taskId: taskId) {
            SharedStore.addPendingRemoval(request.identifier)
            let empty = UNMutableNotificationContent()
            empty.userInfo = request.content.userInfo
            empty.sound = nil
            if #available(iOS 15.0, *) { empty.interruptionLevel = .passive }
            contentHandler(empty)
            return
        }

        // 2. Buttons.
        if let category = PushData.category(for: data) {
            content.categoryIdentifier = category
        }

        // 3. Sound.
        let now = Date()
        if SharedStore.isQuietNow(now) || SharedStore.quietForEvent(at: now.timeIntervalSince1970 * 1000) {
            content.sound = nil
            if #available(iOS 15.0, *) { content.interruptionLevel = .passive }
        } else if let choice = SharedStore.read(.notifySound, as: SoundChoice.self), !choice.file.isEmpty {
            content.sound = UNNotificationSound(named: UNNotificationSoundName(choice.file))
        }

        // 4. One thread per task.
        if !taskId.isEmpty { content.threadIdentifier = "task:\(taskId)" }

        OneSignalExtension.didReceiveNotificationExtensionRequest(request, with: content, withContentHandler: contentHandler)
    }

    override func serviceExtensionTimeWillExpire() {
        // Out of time: OneSignal finishes with what there is, then it shows as it is.
        if let request = receivedRequest, let content = bestAttemptContent {
            OneSignalExtension.serviceExtensionTimeWillExpireRequest(request, with: content)
        }
        if let handler = contentHandler, let content = bestAttemptContent {
            handler(content)
        }
    }
}
