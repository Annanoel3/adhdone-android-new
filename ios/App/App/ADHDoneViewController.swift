import UIKit
import WebKit
import Capacitor
import ADHDoneNative

/// The app's one screen: Capacitor's WebView showing adhdone.space, with
/// ADHDone's own native plugins registered on it (Main.storyboard points here).
/// Same plugin names and methods as the Android app, so the web app does not
/// care which phone it is on. What isn't here yet is listed in IOS_PLAN.md.
class ADHDoneViewController: CAPBridgeViewController {
    /// Tells the website this iPhone app has the "ADHDone" share option, so the
    /// App Guide only offers sharing on builds that have it (phonePlatform.js).
    private static let featureScript =
        "window.ADHDoneIPhone=Object.assign(window.ADHDoneIPhone||{},{shareExtension:true});"

    /// The web app's sign-in, the same three localStorage keys the Android
    /// SessionSnapshotter reads.
    private static let sessionScript =
        "(function(){try{return JSON.stringify({" +
        "token:localStorage.getItem('base44_access_token')," +
        "appId:localStorage.getItem('base44_app_id')," +
        "serverUrl:localStorage.getItem('base44_server_url')});}catch(e){return null;}})()"

    private var sending = false

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NotifyBridge())
        bridge?.registerPluginInstance(CalendarBridge())
        bridge?.registerPluginInstance(RecorderBridge())
        bridge?.registerPluginInstance(BillingBridge())
        bridge?.registerPluginInstance(ContactPickerBridge())

        webView?.configuration.userContentController.addUserScript(
            WKUserScript(source: Self.featureScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))

        // The page needs a few seconds to load and sign in, so look a few times
        // (Android does the same: 3, 8, 20 and 45 seconds).
        for delay in [3.0, 8.0, 20.0, 45.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.copySession() }
        }
        NotificationCenter.default.addObserver(
            self, selector: #selector(cameBack), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func cameBack() {
        // Shares made while the app was closed and couldn't be sent then.
        sendWaitingShares()
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in self?.copySession() }
    }

    /// Copies the sign-in into the keychain group the share extension reads
    /// (SharedSession), then sends any shares that were waiting on it.
    private func copySession() {
        webView?.evaluateJavaScript(Self.featureScript, completionHandler: nil)
        webView?.evaluateJavaScript(Self.sessionScript) { [weak self] value, _ in
            guard let json = value as? String, let data = json.data(using: .utf8),
                  let parsed = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
            func clean(_ key: String) -> String? {
                guard let v = (parsed[key] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
                      !v.isEmpty, v != "null" else { return nil }
                return v
            }
            guard let token = clean("token"), let appId = clean("appId"), let serverUrl = clean("serverUrl") else { return }
            SharedSession.save(SharedSessionInfo(token: token, appId: appId, serverUrl: serverUrl))
            self?.sendWaitingShares()
        }
    }

    /// Sends shares that couldn't go through from the share sheet, oldest
    /// first, with their own capture_id so the server never makes one twice.
    private func sendWaitingShares() {
        guard !sending, let session = SharedSession.load() else { return }
        let waiting = SharedSession.pending()
        guard !waiting.isEmpty else { return }
        sending = true
        var landed = 0
        func next(_ index: Int) {
            guard index < waiting.count else {
                DispatchQueue.main.async { [weak self] in
                    self?.sending = false
                    if landed > 0 {
                        // The task list reloads on this (Tasks.jsx).
                        self?.webView?.evaluateJavaScript(
                            "window.dispatchEvent(new CustomEvent('tasks-changed'))", completionHandler: nil)
                    }
                }
                return
            }
            let capture = waiting[index]
            CaptureAPI.sendText(session, capture: capture) { result in
                if result.delivered || result.code == 400 {
                    SharedSession.removePending(id: capture.id)
                    if result.delivered { landed += 1 }
                }
                // Signed out or no signal: stop here and try again later.
                if result.isAuthFailure || result.code == 0 {
                    next(waiting.count)
                } else {
                    next(index + 1)
                }
            }
        }
        next(0)
    }
}
