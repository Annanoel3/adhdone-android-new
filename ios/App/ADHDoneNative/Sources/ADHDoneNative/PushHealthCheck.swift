import Foundation
import UIKit
import UserNotifications
import BackgroundTasks
import OneSignalFramework
import ADHDoneShared

/// Keeps this iPhone signed up for pushes WITHOUT the app being opened: the twin
/// of Android's PushHealthWorker (Anna, Nov 8 2026, on the Android build 48 fix:
/// "Did we need to do anything to the apple code to make sure onesignal doesn't
/// unsubscribe people").
///
/// Why: a phone's push sign-up can go dead on OneSignal's side ("not subscribed",
/// -10) with the app still installed, and OneSignal's SDK only repairs that when
/// the app is opened. Someone who only meets ADHDone through its reminders never
/// opens it if the reminders stop, so nothing would ever repair it.
///
/// What it does, from the background: when iOS allows ADHDone's notifications,
/// it opts the push sign-up in again (OneSignal.User.pushSubscription.optIn(),
/// the same as Android; it never prompts, because it only runs when permission is
/// already granted). The app starting in the background for this also runs
/// OneSignal's own start-up (NotifyBridge.initialize in AppDelegate). Then it
/// tells our server what it saw (cancelTaskNotifications, mode "push_state",
/// platform "ios"), so "still installed" is known instead of guessed. Nothing is
/// shown to the person. Never the push token itself.
///
/// When: iOS's background app refresh (BGAppRefreshTask, identifier below, listed
/// under BGTaskSchedulerPermittedIdentifiers in Info.plist), asked for 12 hours
/// out each time the app goes to the background. iOS decides when it really runs
/// and gives it about 30 seconds, so the wait for OneSignal plus the report fit
/// inside that. It doesn't run when Background App Refresh is off for ADHDone or
/// in Low Power Mode; the SDK's own repair on the next open still covers those.
public final class PushHealthCheck: NSObject {
    public static let shared = PushHealthCheck()
    public static let taskIdentifier = "com.mediocreatbest.adhdone.push"

    private static let every: TimeInterval = 12 * 3600
    /// OneSignal sends its queued updates every few seconds; this leaves time for
    /// them while staying well inside iOS's ~30 seconds with the report.
    private static let flushWait: TimeInterval = 8

    private var registered = false

    private override init() { super.init() }

    // MARK: - App start

    /// From AppDelegate.didFinishLaunching, after NotifyBridge.initialize: register
    /// the task (must happen before the app finishes launching) and book a run.
    public func start() {
        guard !registered else { return }
        registered = true
        _ = BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.taskIdentifier, using: nil) { [weak self] task in
            guard let self = self, let refresh = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            self.run(refresh)
        }
        NotificationCenter.default.addObserver(self, selector: #selector(wentToBackground),
                                               name: UIApplication.didEnterBackgroundNotification, object: nil)
        scheduleNext()
    }

    @objc private func wentToBackground() {
        scheduleNext()
    }

    /// Asks iOS for the next background run, 12 hours out. iOS treats this as the
    /// earliest, not a promise.
    private func scheduleNext() {
        let request = BGAppRefreshTaskRequest(identifier: Self.taskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: Self.every)
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            // Background App Refresh is off for ADHDone, or iOS refused for now.
        }
    }

    private func run(_ task: BGAppRefreshTask) {
        // Book the one after this first, so a slow run can't cost the next one.
        scheduleNext()
        let once = Once(task)
        task.expirationHandler = { once.finish(false) }
        check(why: "periodic") { once.finish(true) }
    }

    // MARK: - The check

    private func check(why: String, done: @escaping () -> Void) {
        // Signed out, or never signed in on this phone yet: nothing to report to.
        guard let session = SharedSession.load() else { done(); return }
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let allowed = settings.authorizationStatus == .authorized
                || settings.authorizationStatus == .provisional
                || settings.authorizationStatus == .ephemeral
            DispatchQueue.main.async {
                let before = OneSignal.User.pushSubscription
                let optedInBefore = before.optedIn
                let hadTokenBefore = !(before.token ?? "").isEmpty
                let idBefore = before.id ?? ""
                // Only when iOS already allows ADHDone's notifications, so optIn()
                // never tries to show the permission prompt from the background.
                let nudged = allowed
                if nudged {
                    before.optIn()
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + (nudged ? Self.flushWait : 0)) {
                    let after = OneSignal.User.pushSubscription
                    let idAfter = after.id ?? ""
                    var payload: [String: Any] = [
                        "mode": "push_state",
                        "platform": "ios",
                        "why": why,
                        "allowed": allowed,
                        "opted_in_before": optedInBefore,
                        "had_token_before": hadTokenBefore,
                        "opted_in_after": after.optedIn,
                        "has_token_after": !(after.token ?? "").isEmpty,
                        "nudged": nudged,
                        "subscription_id": idAfter.isEmpty ? idBefore : idAfter,
                        "timezone": TimeZone.current.identifier
                    ]
                    if let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String,
                       let number = Int(build) {
                        payload["build"] = number
                    }
                    CaptureAPI.post(session, function: "cancelTaskNotifications", body: payload) { _ in
                        // Never retried in a loop: the next run looks again.
                        done()
                    }
                }
            }
        }
    }
}

/// Ends a background task exactly once, whichever comes first: the check
/// finishing or iOS's deadline.
private final class Once {
    private let task: BGTask
    private let lock = NSLock()
    private var finished = false

    init(_ task: BGTask) { self.task = task }

    func finish(_ success: Bool) {
        lock.lock()
        let first = !finished
        finished = true
        lock.unlock()
        if first { task.setTaskCompleted(success: success) }
    }
}
