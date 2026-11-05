import WidgetKit
import SwiftUI
import ADHDoneShared
#if canImport(AlarmKit)
import AlarmKit
import ActivityKit
#endif

// How an ADHDone alarm looks on the Lock Screen and in the Dynamic Island while
// it is NOT alerting: the 10-minute snooze countdown and a paused one. AlarmKit
// draws the full-screen alert itself (Stop / Snooze / the second button);
// Apple asks for this presentation from the app's widget extension whenever
// an alarm can count down, or the system may dismiss the alarm unannounced.
// iOS 26 and newer only; older iPhones never book an AlarmKit alarm.
#if canImport(AlarmKit)
@available(iOS 26.0, *)
struct AlarmLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AlarmAttributes<ADHDoneAlarmMetadata>.self) { context in
            AlarmLockScreenView(context: context)
                .activityBackgroundTint(WidgetTheme.background)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "alarm.fill").foregroundStyle(WidgetTheme.accent).padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(AlarmLiveActivity.title(context))
                        .font(.headline).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    AlarmCountdownText(state: context.state).font(.headline).monospacedDigit()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(AlarmLiveActivity.line(context)).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                }
            } compactLeading: {
                Image(systemName: "alarm.fill").foregroundStyle(WidgetTheme.accent)
            } compactTrailing: {
                AlarmCountdownText(state: context.state).font(.caption).monospacedDigit().frame(maxWidth: 48)
            } minimal: {
                Image(systemName: "alarm.fill").foregroundStyle(WidgetTheme.accent)
            }
        }
    }

    static func title(_ context: ActivityViewContext<AlarmAttributes<ADHDoneAlarmMetadata>>) -> String {
        let t = context.attributes.metadata?.title ?? ""
        return t.isEmpty ? "ADHDone" : t
    }

    static func line(_ context: ActivityViewContext<AlarmAttributes<ADHDoneAlarmMetadata>>) -> String {
        context.attributes.metadata?.body ?? ""
    }
}

@available(iOS 26.0, *)
struct AlarmLockScreenView: View {
    let context: ActivityViewContext<AlarmAttributes<ADHDoneAlarmMetadata>>

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "alarm.fill").font(.title2).foregroundStyle(WidgetTheme.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text(AlarmLiveActivity.title(context)).font(.headline).foregroundStyle(.white).lineLimit(1)
                Text(stateLine).font(.caption).foregroundStyle(WidgetTheme.dim).lineLimit(2)
            }
            Spacer()
            AlarmCountdownText(state: context.state).font(.title3).monospacedDigit().foregroundStyle(.white)
        }
        .padding(14)
    }

    private var stateLine: String {
        switch context.state.mode {
        case .countdown: return "Snoozed — rings again when the time's up"
        case .paused: return "Paused"
        default: return AlarmLiveActivity.line(context)
        }
    }
}

/// The time left on a snooze, counting down; nothing while the alarm is paused or alerting.
@available(iOS 26.0, *)
struct AlarmCountdownText: View {
    let state: AlarmPresentationState

    var body: some View {
        switch state.mode {
        case .countdown(let countdown):
            Text(timerInterval: Date.now...countdown.fireDate, countsDown: true)
        case .paused:
            Text("Paused")
        default:
            Text("Now")
        }
    }
}
#else
/// Without the iOS 26 SDK there is no AlarmKit: nothing to draw (and nothing is
/// shown in the widget gallery for it).
@available(iOS 26.0, *)
struct AlarmLiveActivity: Widget {
    var body: some WidgetConfiguration {
        EmptyWidgetConfiguration()
    }
}
#endif
