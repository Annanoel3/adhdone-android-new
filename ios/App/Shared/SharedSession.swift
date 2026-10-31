import Foundation
import Security

// Shared by the app and the share extension (both targets compile this file).
//
// The share extension runs outside the app, so it can't read the WebView's
// sign-in. The app copies the sign-in (base44_access_token, base44_app_id,
// base44_server_url from the web app's localStorage, the same three the
// Android SessionSnapshotter reads) into a keychain group both of them can
// open. The extension uses it to hand what was shared to captureText, the same
// server function the Android share sheet uses.
//
// A shared text that couldn't be sent (no signal, signed out) waits here too,
// and the app sends it the next time it opens, with the same capture_id, so the
// server never makes it twice.

struct SharedSessionInfo {
    let token: String
    let appId: String
    let serverUrl: String
}

struct PendingCapture: Codable {
    let id: String
    let text: String
    /// When it was shared, in ms since 1970 (captureText's said_at).
    let saidAt: Double
}

enum SharedSession {
    /// Team ID + group name. Both targets list it under keychain-access-groups.
    static let accessGroup = "C6T8GPVSJ3.com.mediocreatbest.adhdone.shared"
    private static let service = "com.mediocreatbest.adhdone.shared"
    private static let sessionAccount = "session"
    private static let pendingAccount = "pending-captures"

    // MARK: - Sign-in

    /// Saves the sign-in. Returns true when it changed.
    @discardableResult
    static func save(_ info: SharedSessionInfo) -> Bool {
        if let current = load(), current.token == info.token,
           current.appId == info.appId, current.serverUrl == info.serverUrl {
            return false
        }
        let body: [String: String] = ["token": info.token, "appId": info.appId, "serverUrl": info.serverUrl]
        guard let data = try? JSONSerialization.data(withJSONObject: body) else { return false }
        return write(account: sessionAccount, data: data)
    }

    static func load() -> SharedSessionInfo? {
        guard let data = read(account: sessionAccount),
              let body = try? JSONSerialization.jsonObject(with: data) as? [String: String],
              let token = body["token"], !token.isEmpty,
              let appId = body["appId"], !appId.isEmpty,
              let serverUrl = body["serverUrl"], !serverUrl.isEmpty else { return nil }
        return SharedSessionInfo(token: token, appId: appId, serverUrl: serverUrl)
    }

    // MARK: - Shares waiting to be sent

    static func pending() -> [PendingCapture] {
        guard let data = read(account: pendingAccount),
              let list = try? JSONDecoder().decode([PendingCapture].self, from: data) else { return [] }
        return list
    }

    static func addPending(_ capture: PendingCapture) {
        var list = pending().filter { $0.id != capture.id }
        list.append(capture)
        // A keychain item is meant to stay small; 50 waiting shares is plenty.
        if list.count > 50 { list = Array(list.suffix(50)) }
        savePending(list)
    }

    static func removePending(id: String) {
        let list = pending()
        let kept = list.filter { $0.id != id }
        if kept.count != list.count { savePending(kept) }
    }

    private static func savePending(_ list: [PendingCapture]) {
        if list.isEmpty {
            delete(account: pendingAccount)
        } else if let data = try? JSONEncoder().encode(list) {
            write(account: pendingAccount, data: data)
        }
    }

    // MARK: - Keychain

    private static func baseQuery(account: String) -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: accessGroup
        ]
    }

    private static func read(account: String) -> Data? {
        var query = baseQuery(account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        return status == errSecSuccess ? result as? Data : nil
    }

    @discardableResult
    private static func write(account: String, data: Data) -> Bool {
        let query = baseQuery(account: account)
        let update: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecSuccess { return true }
        if status != errSecItemNotFound { return false }
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }

    private static func delete(account: String) {
        SecItemDelete(baseQuery(account: account) as CFDictionary)
    }
}

/// The two server calls a share needs, the same ones the Android app makes
/// (Base44Api.java): readImageCapture turns a picture into a sentence, and
/// captureText turns a sentence into tasks.
enum CaptureAPI {
    struct Result {
        /// HTTP status; 0 means no answer at all (no signal, timed out).
        let code: Int
        let body: [String: Any]?

        var isSuccess: Bool { code >= 200 && code < 300 }
        var isAuthFailure: Bool { code == 401 || code == 403 }
        /// A 2xx where the server says it made nothing (safe to send again).
        var isReportedFailure: Bool { isSuccess && (body?["success"] as? Bool) == false }
        var delivered: Bool { isSuccess && !isReportedFailure }
    }

    static func sendText(_ session: SharedSessionInfo, capture: PendingCapture,
                         completion: @escaping (Result) -> Void) {
        var body: [String: Any] = [
            "text": capture.text,
            "capture_id": capture.id,
            "timezone": TimeZone.current.identifier
        ]
        if capture.saidAt > 0 { body["said_at"] = capture.saidAt }
        post(session, function: "captureText", body: body, completion: completion)
    }

    static func readImage(_ session: SharedSessionInfo, jpegBase64: String,
                          completion: @escaping (Result) -> Void) {
        post(session, function: "readImageCapture",
             body: ["image_base64": jpegBase64, "mime_type": "image/jpeg"], completion: completion)
    }

    private static func post(_ session: SharedSessionInfo, function: String, body: [String: Any],
                             completion: @escaping (Result) -> Void) {
        let base = session.serverUrl.hasSuffix("/") ? String(session.serverUrl.dropLast()) : session.serverUrl
        guard let url = URL(string: "\(base)/api/apps/\(session.appId)/functions/\(function)"),
              let payload = try? JSONSerialization.data(withJSONObject: body) else {
            completion(Result(code: 400, body: nil))
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        // The server takes 6-15 seconds normally; the same wait Android allows.
        request.timeoutInterval = 45
        request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        request.setValue(session.appId, forHTTPHeaderField: "X-App-Id")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = payload
        URLSession.shared.dataTask(with: request) { data, response, _ in
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            var parsed: [String: Any]?
            if let data = data {
                parsed = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            }
            completion(Result(code: code, body: parsed))
        }.resume()
    }
}
