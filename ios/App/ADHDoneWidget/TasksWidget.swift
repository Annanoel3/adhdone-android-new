import WidgetKit
import SwiftUI
import ADHDoneShared

/// Today's tasks on the Home Screen (small and medium) and the Lock Screen
/// (the rectangle, the circle, the one line), with "+" to add one. The list is
/// the one the app hands over on every change (WidgetBridge.updateTasks; the
/// web app's widgetBridge.js decides what's in it: today's tasks, or the
/// upcoming ones under a heading when today is clear). A tap opens the app on
/// Tasks; the "+" opens Add Task (adhdone://open?path=…, read in AppDelegate).
struct TasksWidget: Widget {
    static let kind = "com.mediocreatbest.adhdone.tasks"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: TasksProvider()) { entry in
            TasksWidgetView(entry: entry)
                .containerBackground(for: .widget) { WidgetTheme.background }
        }
        .configurationDisplayName("Today's tasks")
        .description("What's on your list today, and a + to add something.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular, .accessoryInline])
    }
}

struct TasksEntry: TimelineEntry {
    let date: Date
    let payload: WidgetPayload
    /// No list yet (never signed in on this phone, or signed out).
    let empty: Bool
}

struct TasksProvider: TimelineProvider {
    func placeholder(in context: Context) -> TasksEntry {
        TasksEntry(date: Date(), payload: WidgetPayload(heading: "", tasks: [
            WidgetTask(id: "a", title: "Call the pharmacy", time: "2:00 PM", urgency: "high"),
            WidgetTask(id: "b", title: "Move the laundry", time: "", urgency: "medium"),
            WidgetTask(id: "c", title: "Water the plants", time: "6:00 PM", urgency: "low")
        ]), empty: false)
    }

    func getSnapshot(in context: Context, completion: @escaping (TasksEntry) -> Void) {
        completion(current())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TasksEntry>) -> Void) {
        // The app reloads this the moment the list changes; between those, a
        // look once an hour, and at midnight, when "today" moves on.
        let now = Date()
        var next = Calendar.current.date(byAdding: .hour, value: 1, to: now) ?? now.addingTimeInterval(3600)
        if let midnight = Calendar.current.nextDate(after: now, matching: DateComponents(hour: 0, minute: 0, second: 5), matchingPolicy: .nextTime), midnight < next {
            next = midnight
        }
        completion(Timeline(entries: [current()], policy: .after(next)))
    }

    private func current() -> TasksEntry {
        if let payload = SharedStore.read(.widgetTasks, as: WidgetPayload.self) {
            return TasksEntry(date: Date(), payload: payload, empty: false)
        }
        return TasksEntry(date: Date(), payload: WidgetPayload(), empty: true)
    }
}

enum WidgetTheme {
    static let background = Color(red: 0.12, green: 0.11, blue: 0.18)   // #1F1B2E, the alarm screen's
    static let accent = Color(red: 0.55, green: 0.36, blue: 0.96)       // #8B5CF6
    static let dim = Color(red: 0.79, green: 0.76, blue: 0.86)          // #C9C3DC

    static func urgency(_ u: String) -> Color {
        switch u {
        case "urgent": return Color(red: 0.94, green: 0.27, blue: 0.27)
        case "high": return Color(red: 0.98, green: 0.57, blue: 0.24)
        case "low": return Color(red: 0.42, green: 0.72, blue: 0.56)
        default: return accent
        }
    }

    static let openTasks = URL(string: "adhdone://open?path=/Tasks")!
    static let addTask = URL(string: "adhdone://open?path=/AddTask")!
}

struct TasksWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TasksEntry

    private var tasks: [WidgetTask] { entry.payload.tasks }

    var body: some View {
        switch family {
        case .accessoryCircular: circular
        case .accessoryRectangular: rectangular
        case .accessoryInline: Text(inlineText)
        case .systemMedium: home(rows: 5, wide: true)
        default: home(rows: 3, wide: false)
        }
    }

    // MARK: Home Screen

    private func home(rows: Int, wide: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("ADHDone")
                    .font(.caption).fontWeight(.semibold)
                    .foregroundStyle(WidgetTheme.dim)
                Spacer()
                // In the small widget the whole thing is one tap (widgetURL
                // below), so the "+" is a hint there and a button in the medium.
                if wide {
                    Link(destination: WidgetTheme.addTask) { plus }
                } else {
                    plus
                }
            }
            if entry.empty {
                Text("Open ADHDone to see your tasks here.")
                    .font(.footnote).foregroundStyle(WidgetTheme.dim)
                Spacer(minLength: 0)
            } else if tasks.isEmpty {
                Text(entry.payload.heading.isEmpty ? "Nothing due today." : entry.payload.heading)
                    .font(.footnote).foregroundStyle(.white)
                Spacer(minLength: 0)
            } else {
                if !entry.payload.heading.isEmpty {
                    Text(entry.payload.heading).font(.caption2).foregroundStyle(WidgetTheme.dim).lineLimit(1)
                }
                ForEach(tasks.prefix(rows)) { t in
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Circle().fill(WidgetTheme.urgency(t.urgency)).frame(width: 7, height: 7)
                        Text(t.title).font(.footnote).foregroundStyle(.white).lineLimit(1)
                        Spacer(minLength: 0)
                        if wide, !t.time.isEmpty {
                            Text(t.time).font(.caption2).foregroundStyle(WidgetTheme.dim)
                        }
                    }
                }
                if tasks.count > rows {
                    Text("+\(tasks.count - rows) more").font(.caption2).foregroundStyle(WidgetTheme.dim)
                }
                Spacer(minLength: 0)
            }
        }
        .widgetURL(wide ? WidgetTheme.openTasks : (entry.empty || tasks.isEmpty ? WidgetTheme.addTask : WidgetTheme.openTasks))
    }

    private var plus: some View {
        Image(systemName: "plus")
            .font(.caption.weight(.bold))
            .foregroundStyle(.white)
            .frame(width: 22, height: 22)
            .background(Circle().fill(WidgetTheme.accent))
    }

    // MARK: Lock Screen

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 2) {
            if entry.empty {
                Text("ADHDone").font(.headline)
                Text("Open the app to see today").font(.caption2)
            } else if tasks.isEmpty {
                Text("ADHDone").font(.headline)
                Text("Nothing due today").font(.caption2)
            } else {
                Text("\(tasks.count) today").font(.headline)
                ForEach(tasks.prefix(2)) { t in
                    Text("• \(t.title)").font(.caption2).lineLimit(1)
                }
            }
        }
        .widgetURL(WidgetTheme.openTasks)
    }

    private var circular: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Image(systemName: "checklist").font(.caption)
                Text(entry.empty ? "–" : "\(tasks.count)").font(.headline)
            }
        }
        .widgetURL(WidgetTheme.openTasks)
    }

    private var inlineText: String {
        if entry.empty { return "ADHDone" }
        if tasks.isEmpty { return "ADHDone: nothing due today" }
        return tasks.count == 1 ? "ADHDone: 1 task today" : "ADHDone: \(tasks.count) tasks today"
    }
}
