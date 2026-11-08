import UIKit
import UserNotifications
import Capacitor
import ADHDoneNative
import ADHDoneShared

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // The app's own notifications (a snoozed reminder, an alarm shown as a
        // notification) and the buttons on every reminder. Set before OneSignal
        // starts, the order its SDK asks for.
        UNUserNotificationCenter.current().delegate = LocalNotifications.shared
        ReminderActions.registerCategories()
        NotifyBridge.actionHandler = ReminderActions.handle
        // Push notifications start before the web app loads, so a tap on a push that
        // cold-starts the app is kept for NotifyBridge.getLaunchNotification().
        NotifyBridge.initialize(launchOptions: launchOptions)
        // The phone's calendars with the app closed (registered before launch ends,
        // as iOS requires), and the alarms the phone holds.
        BackgroundCalendarSync.shared.start()
        // The push sign-up kept alive with the app closed (the twin of Android's
        // PushHealthWorker), registered before launch ends too, after OneSignal.
        PushHealthCheck.shared.start()
        AlarmEngine.shared.start()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Anything whose silence span ended while the app was away goes back to
        // being an alarm; pushes the extension wanted gone come down.
        AlarmEngine.shared.start()
        AlarmEngine.shared.replan()
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // A widget tap or the Control Center button: adhdone://open?path=/AddTask.
        if let path = WidgetBridge.path(from: url) {
            WidgetBridge.deliverPath(path)
            return true
        }
        // Called when the app was launched with a url. Feed that to the bridge.
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    /// A data-only push from the server, with no app open (the same two
    /// messages Android's PushFilter reads): "this task is finished or gone,
    /// take its alarms off" (drop_alarms_task) and "here are this task's alarms
    /// now" (set_alarms_task, alarms as a JSON list). Both come through
    /// OneSignal with content_available, which wakes the app for a moment.
    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any],
                     fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        let data = PushData.additionalData(from: userInfo)
        if let dropFor = data["drop_alarms_task"] as? String, !dropFor.isEmpty {
            AlarmEngine.shared.cancelTask(taskId: dropFor)
            completionHandler(.newData)
            return
        }
        if let setFor = data["set_alarms_task"] as? String, !setFor.isEmpty {
            var rows: [[String: Any]] = []
            if let list = data["alarms"] as? [[String: Any]] {
                rows = list
            } else if let json = data["alarms"] as? String, let d = json.data(using: .utf8),
                      let list = (try? JSONSerialization.jsonObject(with: d)) as? [[String: Any]] {
                rows = list
            }
            let alarms = rows.compactMap { AlarmBridge.alarm(from: $0) }
            AlarmEngine.shared.replaceTask(taskId: setFor, with: alarms)
            completionHandler(.newData)
            return
        }
        completionHandler(.noData)
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
