import WidgetKit
import SwiftUI
import AppIntents
import ADHDoneShared
#if canImport(AlarmKit)
import AlarmKit
#endif

// Control Center (iOS 18+): the two things the Android quick-settings tile and
// pinned notification offer — silence ADHDone for an hour, and add a task.

/// "Silence ADHDone": on quiets every reminder and alarm for an hour (the same
/// span the app's own 1-hour button gives); off ends it. The notification
/// extension reads the span for pushes; the app re-books the alarms inside it
/// as quiet notifications the next time it runs, and asks AlarmKit directly
/// from here when it can.
@available(iOS 18.0, *)
struct SilenceControl: ControlWidget {
    static let kind = "com.mediocreatbest.adhdone.silence"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind, provider: SilenceProvider()) { isOn in
            ControlWidgetToggle("Silence ADHDone", isOn: isOn, action: SilenceIntent()) { on in
                Label(on ? "Silenced for an hour" : "Silence for an hour", systemImage: on ? "bell.slash.fill" : "bell.fill")
            }
            .tint(.purple)
        }
        .displayName("Silence ADHDone")
        .description("Quiets ADHDone's reminders and alarms for an hour.")
    }
}

@available(iOS 18.0, *)
struct SilenceProvider: ControlValueProvider {
    var previewValue: Bool { false }
    func currentValue() async throws -> Bool { SharedStore.isQuietNow() }
}

@available(iOS 18.0, *)
struct SilenceIntent: SetValueIntent {
    static var title: LocalizedStringResource = "Silence ADHDone"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Silenced") var value: Bool

    init() { value = false }

    func perform() async throws -> some IntentResult {
        let now = Date().timeIntervalSince1970 * 1000
        SharedStore.quietUntilMs = value ? now + 60 * 60 * 1000 : 0
        #if canImport(AlarmKit)
        // Alarms due inside the hour: taken off now when AlarmKit lets an
        // extension do it; the app books them back (or as quiet ones) next time
        // it runs either way.
        if #available(iOS 26.0, *), value {
            for a in SharedStore.alarms() where a.booked == "alarmkit" && a.at > now && a.at < now + 60 * 60 * 1000 {
                try? AlarmManager.shared.cancel(id: AlarmIds.uuid(for: a.id))
                SharedStore.update(alarmId: a.id) { $0.booked = "" }
            }
        }
        #endif
        ControlCenter.shared.reloadControls(ofKind: SilenceControl.kind)
        return .result()
    }
}

/// "Add to ADHDone": opens the app on Add Task.
@available(iOS 18.0, *)
struct AddTaskControl: ControlWidget {
    static let kind = "com.mediocreatbest.adhdone.addtask"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: AddTaskIntent()) {
                Label("Add to ADHDone", systemImage: "plus.circle.fill")
            }
            .tint(.purple)
        }
        .displayName("Add to ADHDone")
        .description("Opens ADHDone ready for a new task.")
    }
}

@available(iOS 18.0, *)
struct AddTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Add to ADHDone"
    static var isDiscoverable: Bool = false
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult & OpensIntent {
        return .result(opensIntent: OpenURLIntent(URL(string: "adhdone://open?path=/AddTask")!))
    }
}
