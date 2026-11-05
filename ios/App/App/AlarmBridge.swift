import Foundation
import UIKit
import Capacitor
import UserNotifications
import ADHDoneShared

/// AlarmBridge — the phone's alarms, sounds and silence for the web app (the
/// twin of Android's AlarmBridge; same method names, so widgetBridge.js and the
/// Settings cards work unchanged; what the iPhone can't do answers honestly).
/// Nov 4 2026. The work is AlarmEngine's; this only reads the calls.
///
///   sync({ alarms, activeTaskIds, quietEnd })  -> { scheduled }   the whole set of task alarms
///   bookOwn({ id, taskId, title, heading, body, at, soundUrl, noSnooze, actions }) -> { ok }   a timer's end
///   cancelOwn({ id })                           -> { ok }
///   stopRinging()                               -> { ok }
///   getStatus()                                 -> { notifications, alarms, alarmKit }   alarms = AlarmKit allowed (undefined when the phone has no AlarmKit)
///   requestAlarmAccess()                        -> { granted }   AlarmKit's own permission (iOS 26+)
///   setSound({ url, name })                     -> { result, ready }   the ring sound ("" = the phone's, "speak:" = the voice)
///   setNotifySound({ url, name, quietOn, quietStart, quietEnd }) -> { result, ready }   regular pushes' sound
///   previewSpeech({ text }) / stopSpeech()      -> { ok }   the voice, now
///   quietFor({ minutes }) / quietOff() / quietStatus() -> { until }   silence ADHDone 1 / 2 / 3 hours
///   setEventQuiet({ on }) / setEventWindows({ windows }) -> { ok }   silent alarms during calendar events
///   setTheme({ background, accent, text })      -> { ok }   the alarm's colours
///   ringLog({ days })                           -> { rows }   "What rang"
///   drainActivity()                             -> { activity }   snoozes, dismissals, Laters since last asked
///   setQuietVibrate / setQuietWhen / wakeWatchStatus / setWakeWatch -> { supported: false }   Android only
///   openExactAlarmSettings / openFullScreenSettings / openOverlaySettings / openUsageAccessSettings
///   / requestIgnoreBatteryOptimizations         -> { ok }   iPhone has none of these switches
@objc(AlarmBridge)
public class AlarmBridge: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AlarmBridge"
    public let jsName = "AlarmBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "bookOwn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelOwn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopRinging", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAlarmAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSound", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNotifySound", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "previewSpeech", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSpeech", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "quietFor", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "quietOff", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "quietStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setEventQuiet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setEventWindows", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTheme", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ringLog", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drainActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setQuietVibrate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setQuietWhen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "wakeWatchStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setWakeWatch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openExactAlarmSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openFullScreenSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openOverlaySettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openUsageAccessSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestIgnoreBatteryOptimizations", returnType: CAPPluginReturnPromise)
    ]

    private let engine = AlarmEngine.shared

    // MARK: - The alarm set

    private static func number(_ v: Any?) -> Double {
        if let d = v as? Double { return d }
        if let i = v as? Int { return Double(i) }
        if let n = v as? NSNumber { return n.doubleValue }
        if let s = v as? String, let d = Double(s) { return d }
        return 0
    }

    private static func alarm(from r: [String: Any]) -> StoredAlarm? {
        guard let id = r["id"] as? String, !id.isEmpty else { return nil }
        let at = number(r["at"])
        guard at > 0 else { return nil }
        var actions = ""
        if let list = r["actions"] as? [[String: Any]], let data = try? JSONSerialization.data(withJSONObject: list) {
            actions = String(data: data, encoding: .utf8) ?? ""
        } else if let s = r["actions"] as? String {
            actions = s
        }
        return StoredAlarm(
            id: id,
            taskId: (r["taskId"] as? String) ?? "",
            title: (r["title"] as? String) ?? "ADHDone",
            heading: (r["heading"] as? String) ?? "",
            body: (r["body"] as? String) ?? "",
            at: at,
            event: (r["event"] as? Bool) ?? false,
            theirTime: (r["theirTime"] as? Bool) ?? false,
            throughQuiet: (r["throughQuiet"] as? Bool) ?? false,
            family: (r["family"] as? String) ?? "",
            openLabel: (r["openLabel"] as? String) ?? "",
            screen: (r["screen"] as? String) ?? "",
            noSnooze: (r["noSnooze"] as? Bool) ?? false,
            soundUrl: (r["soundUrl"] as? String) ?? "",
            actions: actions)
    }

    @objc func sync(_ call: CAPPluginCall) {
        let rows = (call.getArray("alarms") as? [[String: Any]]) ?? []
        let alarms = rows.compactMap { AlarmBridge.alarm(from: $0) }
        let active = call.getArray("activeTaskIds", String.self) ?? []
        let quietEnd = call.getString("quietEnd") ?? "08:00"
        engine.replaceTaskAlarms(alarms, activeTaskIds: active, quietEnd: quietEnd)
        call.resolve(["scheduled": alarms.count])
    }

    @objc func bookOwn(_ call: CAPPluginCall) {
        guard let alarm = AlarmBridge.alarm(from: call.options as? [String: Any] ?? [:]) else {
            call.reject("id and at are required")
            return
        }
        var own = alarm
        if own.noSnooze == false, call.getBool("noSnooze") == nil { own.noSnooze = true }
        engine.bookOwn(own)
        call.resolve(["ok": true])
    }

    @objc func cancelOwn(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else { call.reject("id is required"); return }
        engine.cancel(id: id)
        call.resolve(["ok": true])
    }

    @objc func stopRinging(_ call: CAPPluginCall) {
        engine.stopAll()
        call.resolve(["ok": true])
    }

    // MARK: - Permissions

    @objc func getStatus(_ call: CAPPluginCall) {
        let state = engine.alarmKitState()
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let granted = settings.authorizationStatus == .authorized
                || settings.authorizationStatus == .provisional
                || settings.authorizationStatus == .ephemeral
            var result: [String: Any] = ["notifications": granted, "alarmKit": state]
            // `alarms` only where AlarmKit exists: the web app's alarmSwitchesOff
            // asks for it when it is false, and never where it is left out.
            if state != "unavailable" { result["alarms"] = (state == "authorized") }
            call.resolve(result)
        }
    }

    @objc func requestAlarmAccess(_ call: CAPPluginCall) {
        engine.requestAlarmKit { granted in call.resolve(["granted": granted]) }
    }

    // MARK: - Sounds and the voice

    @objc func setSound(_ call: CAPPluginCall) {
        let url = call.getString("url") ?? ""
        let name = call.getString("name") ?? ""
        SoundFiles.install(url: url, name: name, key: .alarmSound) { ready in
            // Alarms already booked with the old sound are booked again with the new one.
            self.engine.rebookAllForSound()
            call.resolve(["result": ready ? "ok" : "download_failed", "ready": ready])
        }
    }

    @objc func setNotifySound(_ call: CAPPluginCall) {
        let url = call.getString("url") ?? ""
        let name = call.getString("name") ?? ""
        let extra = SoundChoice(quietOn: call.getBool("quietOn") ?? true,
                                quietStart: call.getString("quietStart") ?? "22:00",
                                quietEnd: call.getString("quietEnd") ?? "08:00")
        SoundFiles.install(url: url, name: name, key: .notifySound, extra: extra) { ready in
            call.resolve(["result": ready ? "ok" : "download_failed", "ready": ready])
        }
    }

    @objc func previewSpeech(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        SpeechFiles.shared.speak(text)
        call.resolve(["ok": true])
    }

    @objc func stopSpeech(_ call: CAPPluginCall) {
        SpeechFiles.shared.stop()
        call.resolve(["ok": true])
    }

    // MARK: - Silence

    @objc func quietFor(_ call: CAPPluginCall) {
        let minutes = max(1, min(24 * 60, call.getInt("minutes") ?? 60))
        let until = Date().timeIntervalSince1970 * 1000 + Double(minutes * 60 * 1000)
        SharedStore.quietUntilMs = until
        engine.replan()
        call.resolve(["until": until])
    }

    @objc func quietOff(_ call: CAPPluginCall) {
        SharedStore.quietUntilMs = 0
        engine.replan()
        call.resolve(["until": 0])
    }

    @objc func quietStatus(_ call: CAPPluginCall) {
        let until = SharedStore.quietUntilMs
        call.resolve(["until": SharedStore.isQuietNow() ? until : 0])
    }

    @objc func setEventQuiet(_ call: CAPPluginCall) {
        SharedStore.eventQuiet = call.getBool("on") ?? false
        engine.replan()
        call.resolve(["ok": true])
    }

    @objc func setEventWindows(_ call: CAPPluginCall) {
        let rows = (call.getArray("windows") as? [[String: Any]]) ?? []
        let windows = rows.compactMap { r -> EventWindow? in
            let s = AlarmBridge.number(r["start"]), e = AlarmBridge.number(r["end"])
            return s > 0 && e > s ? EventWindow(start: s, end: e) : nil
        }
        SharedStore.write(.eventWindows, Array(windows.prefix(200)))
        engine.replan()
        call.resolve(["ok": true])
    }

    // MARK: - The look

    @objc func setTheme(_ call: CAPPluginCall) {
        let theme = AlarmTheme(background: call.getString("background") ?? "#1F1B2E",
                               accent: call.getString("accent") ?? "#8B5CF6",
                               text: call.getString("text") ?? "#FFFFFF")
        SharedStore.write(.theme, theme)
        call.resolve(["ok": true])
    }

    // MARK: - What happened

    @objc func ringLog(_ call: CAPPluginCall) {
        let days = call.getInt("days") ?? 2
        let rows = SharedStore.ringLog(days: days).map { r -> [String: Any] in
            ["at": r.at, "taskId": r.taskId, "title": r.title, "body": r.body, "kind": r.kind, "outcome": r.outcome]
        }
        call.resolve(["rows": rows])
    }

    @objc func drainActivity(_ call: CAPPluginCall) {
        let rows = SharedStore.drainActivity().map { r -> [String: Any] in
            ["taskId": r.taskId, "snoozes": r.snoozes, "snoozedUntil": r.snoozedUntil,
             "dismissed": r.dismissed, "ignored": r.ignored, "later": r.later]
        }
        call.resolve(["activity": rows])
    }

    // MARK: - Android only

    @objc func setQuietVibrate(_ call: CAPPluginCall) { call.resolve(["supported": false]) }
    @objc func setQuietWhen(_ call: CAPPluginCall) { call.resolve(["supported": false]) }
    @objc func wakeWatchStatus(_ call: CAPPluginCall) { call.resolve(["supported": false, "on": false]) }
    @objc func setWakeWatch(_ call: CAPPluginCall) { call.resolve(["supported": false, "on": false]) }

    private func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            call.resolve(["ok": true])
        }
    }
    @objc func openExactAlarmSettings(_ call: CAPPluginCall) { openSettings(call) }
    @objc func openFullScreenSettings(_ call: CAPPluginCall) { openSettings(call) }
    @objc func openOverlaySettings(_ call: CAPPluginCall) { openSettings(call) }
    @objc func openUsageAccessSettings(_ call: CAPPluginCall) { openSettings(call) }
    @objc func requestIgnoreBatteryOptimizations(_ call: CAPPluginCall) { call.resolve(["ok": true]) }
}
