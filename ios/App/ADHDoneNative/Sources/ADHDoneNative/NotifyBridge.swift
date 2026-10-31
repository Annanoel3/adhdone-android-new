import Foundation
import UIKit
import UserNotifications
import Capacitor
import OneSignalFramework

/// NotifyBridge — push notifications for the iPhone app, through OneSignal.
/// Same methods the Android NotifyBridge offers, so OneSignalInit.jsx works unchanged:
///
///   await NB.requestPermission()        -> { granted }      (Apple's own prompt, once)
///   await NB.login({ externalId })      -> { playerId }     (the person's email is the external id)
///   await NB.getLaunchNotification()    -> { notification?: { data } }   (the push that opened the app, once)
///   await NB.getPermissionState()       -> { granted }
///   await NB.openNotificationSettings() (the iPhone's Settings page for ADHDone)
///   await NB.openPlayStore()            (the App Store page; the name is kept for the web app)
///   await NB.startAppUpdate()           -> { result: "unavailable" }   (Play's in-app update has no iPhone twin)
///   NB.addListener("notificationOpened", e => e.data)
///   NB.addListener("pushSubscriptionChanged", s => s.id)
///
/// OneSignal itself is started in AppDelegate (NotifyBridge.initialize), before the
/// web app loads, so a tap on a push that cold-starts the app is not lost.
@objc(NotifyBridge)
public class NotifyBridge: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NotifyBridge"
    public let jsName = "NotifyBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "login", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLaunchNotification", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPermissionState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openNotificationSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openPlayStore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startAppUpdate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPlayerId", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openExternal", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deliveredTaskIds", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearTask", returnType: CAPPluginReturnPromise)
    ]

    /// ADHDone's OneSignal app (the same one the Android app uses).
    public static let oneSignalAppId = "dc1933bc-e49e-4d8a-aa4a-2c9ca749ff37"

    /// Data of the push that was tapped most recently and not yet handed to the web app.
    private static var lastLaunchData: [String: Any]?
    private static weak var instance: NotifyBridge?
    private static let clickHandler = ClickHandler()
    private static let subscriptionObserver = SubscriptionObserver()

    // MARK: - App start

    /// Called from AppDelegate.didFinishLaunching. Safe to call once only.
    public static func initialize(launchOptions: [UIApplication.LaunchOptionsKey: Any]?) {
        OneSignal.initialize(oneSignalAppId, withLaunchOptions: launchOptions)
        OneSignal.Notifications.addClickListener(clickHandler)
        OneSignal.User.pushSubscription.addObserver(subscriptionObserver)
    }

    public override func load() {
        super.load()
        NotifyBridge.instance = self
    }

    // MARK: - Methods

    @objc func requestPermission(_ call: CAPPluginCall) {
        OneSignal.Notifications.requestPermission({ accepted in
            call.resolve(["granted": accepted])
        }, fallbackToSettings: false)
    }

    @objc func getPermissionState(_ call: CAPPluginCall) {
        // OneSignal's flag can lag a settings change; the system is the truth.
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let granted = settings.authorizationStatus == .authorized
                || settings.authorizationStatus == .provisional
                || settings.authorizationStatus == .ephemeral
            call.resolve(["granted": granted])
        }
    }

    @objc func login(_ call: CAPPluginCall) {
        guard let externalId = call.getString("externalId"), !externalId.isEmpty else {
            call.reject("externalId is required")
            return
        }
        OneSignal.login(externalId)
        call.resolve(["playerId": NotifyBridge.playerId(), "externalId": externalId])
    }

    @objc func logout(_ call: CAPPluginCall) {
        OneSignal.logout()
        call.resolve()
    }

    @objc func getPlayerId(_ call: CAPPluginCall) {
        call.resolve(["playerId": NotifyBridge.playerId()])
    }

    @objc func getLaunchNotification(_ call: CAPPluginCall) {
        var result: [String: Any] = [:]
        if let data = NotifyBridge.lastLaunchData {
            result["notification"] = ["data": data]
            NotifyBridge.lastLaunchData = nil
        }
        call.resolve(result)
    }

    @objc func openNotificationSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString), UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url)
                call.resolve()
            } else {
                call.reject("Could not open Settings")
            }
        }
    }

    /// The App Store page for ADHDone. ADHDoneAppStoreId in Info.plist is the numeric
    /// id App Store Connect gives the app; until it is set, the App Store search opens.
    @objc func openPlayStore(_ call: CAPPluginCall) {
        let storeId = (Bundle.main.object(forInfoDictionaryKey: "ADHDoneAppStoreId") as? String) ?? ""
        let link = storeId.isEmpty
            ? "https://apps.apple.com/us/search?term=ADHDone"
            : "https://apps.apple.com/app/id\(storeId)"
        DispatchQueue.main.async {
            if let url = URL(string: link) { UIApplication.shared.open(url) }
            call.resolve()
        }
    }

    /// Opens a link outside the app (Safari, Maps, Mail), the same as Android's openUrl.
    @objc func openUrl(_ call: CAPPluginCall) {
        guard let link = call.getString("url"), let url = URL(string: link) else {
            call.reject("url is required")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url)
            call.resolve()
        }
    }

    /// Hands a link to another app: Apple Maps (openMapsApp.js) and Messages with the
    /// text filled in (openSmsApp.js, sms:). Rejects when nothing opened it, so the
    /// web falls back to its own way.
    @objc func openExternal(_ call: CAPPluginCall) {
        guard let link = call.getString("url"), let url = URL(string: link) else {
            call.reject("url is required")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve() } else { call.reject("Nothing on this phone opens that link") }
            }
        }
    }

    // MARK: - Reminders for finished tasks

    /// On Android a finished task's reminders are cleared off the phone by a silent
    /// push (TaskPushes.finished). iPhone has no such filter yet (phase 2: a
    /// Notification Service Extension), so the web app tidies Notification Center
    /// itself: on every open it asks which tasks the reminders still showing are
    /// about, looks those tasks up, and clears the ones that are done or gone
    /// (src/components/utils/iphoneNotificationTidy.js).
    private static func taskId(of info: [AnyHashable: Any]) -> String? {
        var extra: [String: Any] = [:]
        if let custom = info["custom"] as? [String: Any], let a = custom["a"] as? [String: Any] { extra = a }
        else if let a = info["a"] as? [String: Any] { extra = a }
        let id = (extra["taskId"] as? String) ?? (extra["task_id"] as? String) ?? (info["taskId"] as? String)
        return (id?.isEmpty == false) ? id : nil
    }

    @objc func deliveredTaskIds(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getDeliveredNotifications { list in
            var ids = Set<String>()
            for n in list {
                if let id = NotifyBridge.taskId(of: n.request.content.userInfo) { ids.insert(id) }
            }
            call.resolve(["taskIds": Array(ids)])
        }
    }

    @objc func clearTask(_ call: CAPPluginCall) {
        guard let target = call.getString("taskId"), !target.isEmpty else {
            call.reject("taskId is required")
            return
        }
        let center = UNUserNotificationCenter.current()
        center.getDeliveredNotifications { list in
            let gone = list.filter { NotifyBridge.taskId(of: $0.request.content.userInfo) == target }
                .map { $0.request.identifier }
            if !gone.isEmpty { center.removeDeliveredNotifications(withIdentifiers: gone) }
            call.resolve(["cleared": gone.count])
        }
    }

    @objc func startAppUpdate(_ call: CAPPluginCall) {
        call.resolve(["result": "unavailable"])
    }

    // MARK: - OneSignal events

    private static func playerId() -> String {
        if let id = OneSignal.User.onesignalId, !id.isEmpty { return id }
        return OneSignal.User.pushSubscription.id ?? ""
    }

    fileprivate static func notificationOpened(_ data: [String: Any]) {
        lastLaunchData = data
        instance?.notifyListeners("notificationOpened", data: ["data": data])
    }

    fileprivate static func subscriptionChanged(id: String?, token: String?, optedIn: Bool) {
        instance?.notifyListeners("pushSubscriptionChanged", data: [
            "id": id ?? "",
            "token": token ?? "",
            "optedIn": optedIn
        ])
    }
}

private final class ClickHandler: NSObject, OSNotificationClickListener {
    func onClick(event: OSNotificationClickEvent) {
        var data: [String: Any] = [:]
        if let extra = event.notification.additionalData as? [String: Any] { data = extra }
        if let actionId = event.result.actionId, !actionId.isEmpty { data["actionId"] = actionId }
        NotifyBridge.notificationOpened(data)
    }
}

private final class SubscriptionObserver: NSObject, OSPushSubscriptionObserver {
    func onPushSubscriptionDidChange(state: OSPushSubscriptionChangedState) {
        NotifyBridge.subscriptionChanged(id: state.current.id, token: state.current.token, optedIn: state.current.optedIn)
    }
}
