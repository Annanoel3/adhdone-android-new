import Foundation
import Capacitor
import WidgetKit
import ADHDoneShared

/// WidgetBridge — the Home Screen / Lock Screen widget's data, and taps on it
/// (the twin of Android's WidgetBridge, same methods, so widgetBridge.js and
/// WidgetOpenReceiver.jsx work unchanged). Nov 4 2026.
///
///   updateTasks({ generatedFor, heading, tasks })  -> { ok }   the list the widget draws (SharedStore, keychain group)
///   clearTasks()                                   -> { ok }   signed out: an empty widget
///   getWidgetCount()                               -> { count } how many ADHDone widgets are placed
///   getPendingWidgetOpen()                         -> { path? } a tap that came before the web app was listening
///   addListener("widgetOpen", e => e.path)                    a tap while the app is up
///
/// A tap on the widget opens the app with adhdone://open?path=/Tasks (the "+"
/// with /AddTask); AppDelegate hands the path to deliverPath, exactly once: to
/// the web app when it is listening, otherwise kept for getPendingWidgetOpen.
@objc(WidgetBridge)
public class WidgetBridge: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridge"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "updateTasks", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearTasks", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getWidgetCount", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingWidgetOpen", returnType: CAPPluginReturnPromise)
    ]

    public static let scheme = "adhdone"
    private static weak var instance: WidgetBridge?
    private static var pendingPath: String?

    public override func load() {
        super.load()
        WidgetBridge.instance = self
    }

    // MARK: - Taps

    /// A widget's (or an alarm button's) "open the app here". Exactly once.
    public static func deliverPath(_ raw: String) {
        let path = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard path.hasPrefix("/") else { return }
        DispatchQueue.main.async {
            if let plugin = instance, plugin.hasListeners("widgetOpen") {
                plugin.notifyListeners("widgetOpen", data: ["path": path])
                pendingPath = nil
            } else {
                pendingPath = path
            }
        }
    }

    /// adhdone://open?path=/AddTask → the path. Nil for any other link.
    public static func path(from url: URL) -> String? {
        guard url.scheme?.lowercased() == scheme else { return nil }
        let parts = URLComponents(url: url, resolvingAgainstBaseURL: false)
        if let p = parts?.queryItems?.first(where: { $0.name == "path" })?.value, p.hasPrefix("/") { return p }
        // adhdone://Tasks, adhdone://AddTask
        if let host = url.host, !host.isEmpty, host.lowercased() != "open" { return "/\(host)\(url.path)" }
        return "/Tasks"
    }

    @objc func getPendingWidgetOpen(_ call: CAPPluginCall) {
        var result: [String: Any] = [:]
        if let p = WidgetBridge.pendingPath {
            result["path"] = p
            WidgetBridge.pendingPath = nil
        }
        call.resolve(result)
    }

    // MARK: - The list

    @objc func updateTasks(_ call: CAPPluginCall) {
        let generatedFor = call.getString("generatedFor") ?? ""
        let heading = call.getString("heading") ?? ""
        var tasks: [WidgetTask] = []
        if let rows = call.getArray("tasks") as? [[String: Any]] {
            for r in rows.prefix(12) {
                guard let id = r["id"] as? String, let title = r["title"] as? String else { continue }
                tasks.append(WidgetTask(id: id, title: title, time: (r["time"] as? String) ?? "", urgency: (r["urgency"] as? String) ?? "medium"))
            }
        }
        SharedStore.write(.widgetTasks, WidgetPayload(generatedFor: generatedFor, heading: heading, tasks: tasks))
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve(["ok": true])
    }

    @objc func clearTasks(_ call: CAPPluginCall) {
        SharedStore.remove(.widgetTasks)
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve(["ok": true])
    }

    @objc func getWidgetCount(_ call: CAPPluginCall) {
        WidgetCenter.shared.getCurrentConfigurations { result in
            let count = (try? result.get().count) ?? 0
            call.resolve(["count": count])
        }
    }
}
