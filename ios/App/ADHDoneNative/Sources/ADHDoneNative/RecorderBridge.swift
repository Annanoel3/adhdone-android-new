import Foundation
import AVFoundation
import UIKit
import Capacitor

/// RecorderBridge — the Record Notes recorder on iPhone. Same contract as the
/// Android RecorderBridge, so pages/Notes.jsx and RecordingBar.jsx work unchanged:
///
///   await R.start({ title?, maxMinutes? })   -> { ok, sessionId, error? }
///   await R.pause() / R.resume()             -> { ok, session }
///   await R.stop()                           -> { ok, session }
///   await R.status()                         -> { recording, session }
///   await R.listSessions()                   -> { sessions: [...] }   (newest first)
///   await R.readPart({ sessionId, index })   -> { base64, mimeType: "audio/mp4", bytes, fileName }
///   await R.deleteSession({ sessionId })     -> { ok }
///   R.addListener("recorder", e => ...)      // e = { type, session, error? }
///
/// Event types: started, paused, resumed, part (a part finished and can be read),
/// stopped (error "time_limit" | "recorder_error" | "service_ended" when it stopped on
/// its own), error (it never started: "mic_permission_denied" | "mic_unavailable").
///
/// Keeps recording with the screen off or another app in front thanks to the
/// "audio" background mode (Info.plist UIBackgroundModes) and an AVAudioSession in
/// .record. A phone call pauses it; when the call ends it carries on. Audio is saved
/// in ~10 minute parts (AAC .m4a, mono, 64 kbps, about 5 MB each), each one well
/// under the transcription upload limit. The switch between parts loses a fraction
/// of a second, like Android 7 does.
@objc(RecorderBridge)
public class RecorderBridge: CAPPlugin, CAPBridgedPlugin, AVAudioRecorderDelegate {
    public let identifier = "RecorderBridge"
    public let jsName = "RecorderBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listSessions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readPart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise)
    ]

    private static let partSeconds: TimeInterval = 10 * 60
    private static let hardMaxMinutes = 8 * 60
    private static let tickSeconds: TimeInterval = 30

    private var recorder: AVAudioRecorder?
    private var session: [String: Any]?
    private var activeId: String?
    private var partIndex = 0
    private var paused = false
    private var runStartedAt: TimeInterval = 0   // uptime when the current run began
    private var accumulatedMs: Int64 = 0         // recorded time before the current run
    private var maxMs: Int64 = Int64(hardMaxMinutes) * 60_000
    private var tickTimer: Timer?
    private var partTimer: Timer?
    private var rotating = false

    public override func load() {
        super.load()
        RecorderStore.settleOrphans(activeId: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: AVAudioSession.sharedInstance())
        NotificationCenter.default.addObserver(self, selector: #selector(appWillTerminate), name: UIApplication.willTerminateNotification, object: nil)
    }

    // MARK: - Permission

    private func micState() -> String {
        if #available(iOS 17.0, *) {
            switch AVAudioApplication.shared.recordPermission {
            case .granted: return "granted"
            case .denied: return "denied"
            default: return "prompt"
            }
        }
        switch AVAudioSession.sharedInstance().recordPermission {
        case .granted: return "granted"
        case .denied: return "denied"
        default: return "prompt"
        }
    }

    private func askMic(_ done: @escaping (Bool) -> Void) {
        if #available(iOS 17.0, *) {
            AVAudioApplication.requestRecordPermission { ok in DispatchQueue.main.async { done(ok) } }
        } else {
            AVAudioSession.sharedInstance().requestRecordPermission { ok in DispatchQueue.main.async { done(ok) } }
        }
    }

    @objc public override func checkPermissions(_ call: CAPPluginCall) {
        call.resolve(["microphone": micState()])
    }

    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        askMic { _ in call.resolve(["microphone": self.micState()]) }
    }

    // MARK: - Recording

    @objc func start(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? ""
        let maxMinutes = call.getInt("maxMinutes") ?? 0
        DispatchQueue.main.async {
            if let active = self.activeId {
                // Record twice must not start a second recording.
                call.resolve(["ok": true, "sessionId": active, "alreadyRecording": true])
                return
            }
            if self.micState() == "denied" {
                call.resolve(["ok": false, "error": "mic_permission_denied"])
                return
            }
            self.askMic { granted in
                guard granted else {
                    call.resolve(["ok": false, "error": "mic_permission_denied"])
                    return
                }
                let id = "rec\(Int64(Date().timeIntervalSince1970 * 1000))"
                if let problem = self.beginSession(id: id, title: title, maxMinutes: maxMinutes) {
                    call.resolve(["ok": false, "sessionId": id, "error": problem])
                } else {
                    call.resolve(["ok": true, "sessionId": id])
                }
            }
        }
    }

    private func beginSession(id: String, title: String, maxMinutes: Int) -> String? {
        RecorderStore.settleOrphans(activeId: nil)
        var minutes = maxMinutes
        if minutes <= 0 || minutes > RecorderBridge.hardMaxMinutes { minutes = RecorderBridge.hardMaxMinutes }
        maxMs = Int64(minutes) * 60_000
        session = [
            "id": id,
            "title": title,
            "startedAt": Date().timeIntervalSince1970 * 1000,
            "stoppedAt": NSNull(),
            "state": "recording",
            "elapsedMs": 0,
            "error": NSNull(),
            "parts": [[String: Any]]()
        ]
        activeId = id
        partIndex = 0
        accumulatedMs = 0
        paused = false
        do {
            let audio = AVAudioSession.sharedInstance()
            try audio.setCategory(.record, mode: .default, options: [.allowBluetooth])
            try audio.setActive(true)
        } catch {
            NSLog("ADHDone recorder: audio session failed: %@", error.localizedDescription)
            refuse(id: id, title: title, problem: "mic_unavailable")
            return "mic_unavailable"
        }
        if let problem = startPart() {
            refuse(id: id, title: title, problem: problem)
            return problem
        }
        runStartedAt = ProcessInfo.processInfo.systemUptime
        RecorderStore.write(session!)
        tickTimer = Timer.scheduledTimer(withTimeInterval: RecorderBridge.tickSeconds, repeats: true) { [weak self] _ in self?.tick() }
        emit("started", nil, nil)
        return nil
    }

    /// A recording that never got going: saved as stopped with the reason.
    private func refuse(id: String, title: String, problem: String) {
        let now = Date().timeIntervalSince1970 * 1000
        let s: [String: Any] = ["id": id, "title": title, "startedAt": now, "stoppedAt": now, "state": "stopped", "elapsedMs": 0, "error": problem, "parts": [[String: Any]]()]
        RecorderStore.write(s)
        session = nil
        activeId = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        emit("error", s, problem)
    }

    /// Starts a fresh recorder writing part number partIndex. Returns a problem, or nil.
    private func startPart() -> String? {
        guard let id = activeId else { return "mic_unavailable" }
        let url = RecorderStore.partFile(id, partIndex)
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 64_000,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue
        ]
        do {
            let r = try AVAudioRecorder(url: url, settings: settings)
            r.delegate = self
            r.prepareToRecord()
            guard r.record() else {
                try? FileManager.default.removeItem(at: url)
                return "mic_unavailable"
            }
            recorder = r
        } catch {
            NSLog("ADHDone recorder: could not start the microphone: %@", error.localizedDescription)
            try? FileManager.default.removeItem(at: url)
            return "mic_unavailable"
        }
        addPart(partIndex, startMs: elapsedMs())
        partTimer?.invalidate()
        partTimer = Timer.scheduledTimer(withTimeInterval: RecorderBridge.partSeconds, repeats: false) { [weak self] _ in self?.rotatePart() }
        return nil
    }

    /// Closes the part being written and starts the next one straight away.
    private func rotatePart() {
        guard session != nil, !paused, !rotating else { return }
        rotating = true
        let now = elapsedMs()
        let closed = releaseRecorder(stop: true)
        finishPart(partIndex, endMs: now, ok: closed)
        partIndex += 1
        let problem = startPart()
        if let s = session { RecorderStore.write(s) }
        emit("part", nil, nil)
        rotating = false
        if let problem = problem { stopRecording(reason: problem) }
    }

    private func tick() {
        guard session != nil else { return }
        let elapsed = elapsedMs()
        if elapsed >= maxMs { stopRecording(reason: "time_limit"); return }
        session?["elapsedMs"] = elapsed
        if let s = session { RecorderStore.write(s) }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let id = self.activeId else { call.resolve(["ok": false, "error": "not_recording"]); return }
            self.pauseRecording()
            call.resolve(["ok": true, "session": self.saved(id)])
        }
    }

    @objc func resume(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let id = self.activeId else { call.resolve(["ok": false, "error": "not_recording"]); return }
            self.resumeRecording()
            call.resolve(["ok": true, "session": self.saved(id)])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let id = self.activeId else { call.resolve(["ok": false, "error": "not_recording"]); return }
            self.stopRecording(reason: nil)
            call.resolve(["ok": true, "session": self.saved(id)])
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let id = self.activeId {
                var s = RecorderStore.read(id) ?? [:]
                s["elapsedMs"] = self.elapsedMs()
                call.resolve(["recording": true, "session": s])
            } else {
                call.resolve(["recording": false, "session": NSNull()])
            }
        }
    }

    private func pauseRecording() {
        guard session != nil, !paused, let r = recorder else { return }
        r.pause()
        accumulatedMs += Int64((ProcessInfo.processInfo.systemUptime - runStartedAt) * 1000)
        paused = true
        partTimer?.invalidate()
        session?["state"] = "paused"
        session?["elapsedMs"] = accumulatedMs
        if let s = session { RecorderStore.write(s) }
        emit("paused", nil, nil)
    }

    private func resumeRecording() {
        guard session != nil, paused, let r = recorder else { return }
        try? AVAudioSession.sharedInstance().setActive(true)
        guard r.record() else { stopRecording(reason: "recorder_error"); return }
        runStartedAt = ProcessInfo.processInfo.systemUptime
        paused = false
        // The part keeps whatever time it had left before the pause.
        let partStart = (session?["parts"] as? [[String: Any]])?.last?["startMs"] as? Int64 ?? 0
        let left = max(5, RecorderBridge.partSeconds - Double(accumulatedMs - partStart) / 1000)
        partTimer?.invalidate()
        partTimer = Timer.scheduledTimer(withTimeInterval: left, repeats: false) { [weak self] _ in self?.rotatePart() }
        session?["state"] = "recording"
        if let s = session { RecorderStore.write(s) }
        emit("resumed", nil, nil)
    }

    /// reason: nil when the person stopped it; otherwise why it stopped on its own.
    private func stopRecording(reason: String?) {
        guard session != nil else { return }
        tickTimer?.invalidate(); tickTimer = nil
        partTimer?.invalidate(); partTimer = nil
        let now = elapsedMs()
        let closed = releaseRecorder(stop: true)
        finishPart(partIndex, endMs: now, ok: closed)
        session?["state"] = "stopped"
        session?["stoppedAt"] = Date().timeIntervalSince1970 * 1000
        session?["elapsedMs"] = now
        session?["error"] = reason ?? NSNull()
        let done = session!
        RecorderStore.write(done)
        session = nil
        activeId = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        emit("stopped", done, reason)
    }

    private func releaseRecorder(stop: Bool) -> Bool {
        guard let r = recorder else { return false }
        var ok = true
        if stop {
            let had = r.currentTime > 0
            r.stop()
            ok = had
        }
        recorder = nil
        return ok
    }

    /// The session as saved on disk, or null for the web app.
    private func saved(_ id: String) -> Any {
        if let s = RecorderStore.read(id) { return s }
        return NSNull()
    }

    private func elapsedMs() -> Int64 {
        guard session != nil else { return accumulatedMs }
        return paused ? accumulatedMs : accumulatedMs + Int64((ProcessInfo.processInfo.systemUptime - runStartedAt) * 1000)
    }

    // MARK: - session.json

    private func addPart(_ index: Int, startMs: Int64) {
        guard let id = activeId, var parts = session?["parts"] as? [[String: Any]] else { return }
        parts.append(["index": index, "file": RecorderStore.partFile(id, index).lastPathComponent, "startMs": startMs, "endMs": NSNull(), "bytes": 0, "ok": true])
        session?["parts"] = parts
    }

    private func finishPart(_ index: Int, endMs: Int64, ok: Bool) {
        guard let id = activeId, var parts = session?["parts"] as? [[String: Any]] else { return }
        for i in stride(from: parts.count - 1, through: 0, by: -1) where (parts[i]["index"] as? Int) == index {
            let url = RecorderStore.partFile(id, index)
            let bytes = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int64) ?? 0
            parts[i]["endMs"] = endMs
            parts[i]["bytes"] = bytes
            parts[i]["ok"] = ok && bytes > 0
            if bytes == 0 { try? FileManager.default.removeItem(at: url) }
            break
        }
        session?["parts"] = parts
    }

    // MARK: - Recordings on the phone

    @objc func listSessions(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            RecorderStore.settleOrphans(activeId: self.activeId)
            call.resolve(["sessions": RecorderStore.all()])
        }
    }

    @objc func readPart(_ call: CAPPluginCall) {
        let id = RecorderStore.safe(call.getString("sessionId"))
        guard !id.isEmpty, let index = call.getInt("index") else { call.reject("sessionId and index are required"); return }
        let url = RecorderStore.partFile(id, index)
        guard FileManager.default.fileExists(atPath: url.path) else { call.reject("No such part"); return }
        if id == activeId, let parts = session?["parts"] as? [[String: Any]],
           parts.contains(where: { ($0["index"] as? Int) == index && ($0["endMs"] == nil || $0["endMs"] is NSNull) }) {
            call.reject("That part is still being recorded")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            guard let data = try? Data(contentsOf: url) else { call.reject("Could not read that part"); return }
            call.resolve(["base64": data.base64EncodedString(), "mimeType": "audio/mp4", "fileName": url.lastPathComponent, "bytes": data.count])
        }
    }

    @objc func deleteSession(_ call: CAPPluginCall) {
        let id = RecorderStore.safe(call.getString("sessionId"))
        DispatchQueue.main.async {
            if id.isEmpty || id == self.activeId { call.resolve(["ok": false]); return }
            call.resolve(["ok": RecorderStore.delete(id)])
        }
    }

    // MARK: - The phone's interruptions

    /// A phone call or Siri takes the microphone: pause, and carry on when it ends.
    @objc private func interrupted(_ note: Notification) {
        guard let info = note.userInfo, let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        DispatchQueue.main.async {
            if type == .began {
                self.pauseRecording()
            } else if type == .ended {
                let opts = AVAudioSession.InterruptionOptions(rawValue: (info[AVAudioSessionInterruptionOptionKey] as? UInt) ?? 0)
                if opts.contains(.shouldResume) { self.resumeRecording() }
            }
        }
    }

    @objc private func appWillTerminate() {
        if session != nil { stopRecording(reason: "service_ended") }
    }

    public func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        DispatchQueue.main.async { self.stopRecording(reason: "recorder_error") }
    }

    public func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        // Stopped by the system (not by us): close the recording properly.
        if !flag, session != nil, self.recorder === recorder {
            DispatchQueue.main.async { self.stopRecording(reason: "recorder_error") }
        }
    }

    // MARK: - Events to the web app

    private func emit(_ type: String, _ s: [String: Any]?, _ error: String?) {
        var payload: [String: Any] = ["type": type]
        if let s = s ?? session { payload["session"] = s } else if let id = activeId, let saved = RecorderStore.read(id) { payload["session"] = saved }
        if let error = error { payload["error"] = error }
        notifyListeners("recorder", data: payload, retainUntilConsumed: true)
    }
}
