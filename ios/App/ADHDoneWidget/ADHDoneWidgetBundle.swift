import WidgetKit
import SwiftUI

/// ADHDoneWidget — everything ADHDone puts outside the app on iPhone (Nov 4 2026):
///   TasksWidget        the Home Screen and Lock Screen widget with today's tasks and "+"
///                      (the twin of Android's TodayWidgetProvider)
///   SilenceControl     the Control Center button that quiets ADHDone for an hour (iOS 18+;
///                      Android's quick-settings tile and pinned-notification Silence buttons)
///   AddTaskControl     the Control Center button that opens the app on Add Task
///   AlarmLiveActivity  how an alarm's snooze countdown looks on the Lock Screen and in the
///                      Dynamic Island (iOS 26+; AlarmKit draws the alert itself)
@main
struct ADHDoneWidgetBundle: WidgetBundle {
    var body: some Widget {
        TasksWidget()
        controls
        liveActivity
    }

    @WidgetBundleBuilder
    private var controls: some Widget {
        if #available(iOS 18.0, *) {
            SilenceControl()
            AddTaskControl()
        }
    }

    @WidgetBundleBuilder
    private var liveActivity: some Widget {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            AlarmLiveActivity()
        }
        #endif
    }
}
