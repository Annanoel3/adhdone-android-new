import Foundation

// The AlarmKit alarm's metadata: what the widget extension needs to draw the
// alarm's Live Activity (the countdown while a snooze runs, the paused state)
// and what the app needs to know which task rang. Shared by the app
// (AlarmEngine) and the widget (AlarmLiveActivity). AlarmKit is iOS 26 and
// newer; on an older iPhone, or an older Xcode, none of this exists and the
// alarms are time-sensitive notifications instead.
#if canImport(AlarmKit)
import AlarmKit

@available(iOS 26.0, *)
public struct ADHDoneAlarmMetadata: AlarmMetadata {
    public var alarmId: String
    public var taskId: String
    public var title: String
    public var body: String
    public var event: Bool
    public var openLabel: String
    public var screen: String

    public init(alarmId: String, taskId: String, title: String, body: String, event: Bool, openLabel: String = "", screen: String = "") {
        self.alarmId = alarmId
        self.taskId = taskId
        self.title = title
        self.body = body
        self.event = event
        self.openLabel = openLabel
        self.screen = screen
    }
}
#endif

/// Every alarm the phone books under AlarmKit gets a UUID made from its id
/// string, the same way every time, so the alarm can be found again by the id
/// the web app knows ("<taskId>:<ms>", "push:<id>", a timer's own id).
public enum AlarmIds {
    public static func uuid(for alarmId: String) -> UUID {
        // FNV-1a, 64 bits twice with different seeds, folded into the 16 bytes
        // a UUID holds. Deterministic and collision-free for the handful of
        // alarms one phone holds.
        func fnv(_ s: String, seed: UInt64) -> UInt64 {
            var h: UInt64 = seed
            for b in s.utf8 {
                h ^= UInt64(b)
                h = h &* 0x100000001b3
            }
            return h
        }
        let a = fnv(alarmId, seed: 0xcbf29ce484222325)
        let b = fnv(alarmId, seed: 0x84222325cbf29ce4)
        var bytes = [UInt8](repeating: 0, count: 16)
        for i in 0..<8 {
            bytes[i] = UInt8((a >> (8 * UInt64(i))) & 0xff)
            bytes[8 + i] = UInt8((b >> (8 * UInt64(i))) & 0xff)
        }
        // Version 4, variant 1 bits, so it reads as a proper UUID.
        bytes[6] = (bytes[6] & 0x0f) | 0x40
        bytes[8] = (bytes[8] & 0x3f) | 0x80
        return UUID(uuid: (bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
                           bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]))
    }
}
