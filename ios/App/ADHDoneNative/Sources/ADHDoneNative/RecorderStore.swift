import Foundation

/// RecorderStore — where Record Notes keeps its recordings on the iPhone. Same
/// layout and session.json shape as the Android RecorderStore, so the web app's
/// Notes page reads both the same way:
///
///   Application Support/recordings/<sessionId>/session.json
///   Application Support/recordings/<sessionId>/part-000.m4a, part-001.m4a, ...
///
///   { id, title, startedAt, stoppedAt, state, elapsedMs, error,
///     parts: [{ index, file, startMs, endMs, bytes, ok }] }
///
/// state: "recording" | "paused" | "stopped" | "interrupted" (the app was killed
/// mid-recording). Nothing here ever leaves the phone on its own: the web app
/// reads parts through RecorderBridge, sends them for transcription itself, and
/// deletes the recording when it has what it needs.
enum RecorderStore {
    static let meta = "session.json"
    private static let lock = NSLock()

    static func root() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = base.appendingPathComponent("recordings", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            // Never backed up to iCloud: these are big and the web app clears them.
            var values = URLResourceValues(); values.isExcludedFromBackup = true
            var d = dir; try? d.setResourceValues(values)
        }
        return dir
    }

    /// Session ids are made here, but never let one reach outside the folder.
    static func safe(_ id: String?) -> String {
        guard let id = id else { return "" }
        return id.filter { $0.isLetter || $0.isNumber || $0 == "_" || $0 == "-" }
    }

    static func sessionDir(_ id: String) -> URL {
        return root().appendingPathComponent(safe(id), isDirectory: true)
    }

    static func partFile(_ id: String, _ index: Int) -> URL {
        return sessionDir(id).appendingPathComponent(String(format: "part-%03d.m4a", index))
    }

    static func read(_ id: String) -> [String: Any]? {
        lock.lock(); defer { lock.unlock() }
        let url = sessionDir(id).appendingPathComponent(meta)
        guard let data = try? Data(contentsOf: url),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return obj
    }

    /// Written to a temp file and moved into place, so a crash mid-write never leaves half a file.
    static func write(_ session: [String: Any]) {
        lock.lock(); defer { lock.unlock() }
        guard let id = session["id"] as? String, !safe(id).isEmpty else { return }
        let dir = sessionDir(id)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let tmp = dir.appendingPathComponent(meta + ".tmp")
        let dest = dir.appendingPathComponent(meta)
        guard let data = try? JSONSerialization.data(withJSONObject: session) else { return }
        do {
            try data.write(to: tmp, options: .atomic)
            if FileManager.default.fileExists(atPath: dest.path) { try FileManager.default.removeItem(at: dest) }
            try FileManager.default.moveItem(at: tmp, to: dest)
        } catch {
            NSLog("ADHDone recorder: could not save %@: %@", dest.path, error.localizedDescription)
        }
    }

    /// Newest first.
    static func all() -> [[String: Any]] {
        let dirs = (try? FileManager.default.contentsOfDirectory(at: root(), includingPropertiesForKeys: nil)) ?? []
        var list: [[String: Any]] = []
        for d in dirs {
            var isDir: ObjCBool = false
            guard FileManager.default.fileExists(atPath: d.path, isDirectory: &isDir), isDir.boolValue else { continue }
            if let s = read(d.lastPathComponent) { list.append(s) }
        }
        return list.sorted { (($0["startedAt"] as? Double) ?? 0) > (($1["startedAt"] as? Double) ?? 0) }
    }

    static func delete(_ id: String) -> Bool {
        let dir = sessionDir(id)
        guard !safe(id).isEmpty, FileManager.default.fileExists(atPath: dir.path) else { return false }
        return (try? FileManager.default.removeItem(at: dir)) != nil
    }

    /// A recording still marked "recording"/"paused" while nothing is recording was
    /// cut off (the app was killed, the phone restarted). It becomes "interrupted"
    /// and the part that was being written is marked unreadable.
    static func settleOrphans(activeId: String?) {
        for var s in all() {
            let state = s["state"] as? String ?? ""
            guard state == "recording" || state == "paused" else { continue }
            if let active = activeId, active == (s["id"] as? String ?? "") { continue }
            s["state"] = "interrupted"
            if s["stoppedAt"] == nil || s["stoppedAt"] is NSNull { s["stoppedAt"] = Date().timeIntervalSince1970 * 1000 }
            if var parts = s["parts"] as? [[String: Any]], var last = parts.last {
                if last["endMs"] == nil || last["endMs"] is NSNull { last["ok"] = false; parts[parts.count - 1] = last; s["parts"] = parts }
            }
            write(s)
        }
    }
}
