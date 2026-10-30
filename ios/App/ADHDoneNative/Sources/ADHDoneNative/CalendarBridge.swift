import Foundation
import Capacitor
import EventKit

/// CalendarBridge — the iPhone's calendars (iCloud, Google, Outlook, local...),
/// through EventKit. Same shape as the Android CalendarBridge, so calendarSync.js
/// and functions/phoneCalendar do not know the difference:
///
///   listCalendars()                       -> { granted, calendars: [{ id, name, account, accountType, color, visible, isPrimary, owner }] }
///   listWritableCalendars()               -> same, only calendars ADHDone may write into
///   requestPermissions({ permissions })   -> { calendar: "granted"|"denied", calendarWrite: ... }
///   checkPermissions()                    -> same
///   listEvents({ calendarIds, days })     -> { granted, events: [rows] }
///   writeEvents({ calendarId, events })   -> { granted, results: [{ key, ok, deviceEventId, hash, error? }] }
///   deleteEvents({ deviceEventIds })      -> { granted, deleted }
///   setSyncCalendars({ calendarIds })     -> { watching }   (nothing runs in the background on iPhone; the app syncs on open)
///   setExportEnabled({ enabled })         -> { ok }
///
/// Rows from listEvents follow the Android Calendar Provider shape the server
/// already reads: times are epoch milliseconds, all-day events sit at UTC
/// midnight, a repeating series comes back ONCE as its master row with `rrule`
/// and `nextBegin`/`nextEnd` (its first occurrence in the window), and an edited
/// occurrence comes back as its own row with `originalId` / `originalInstanceTime`.
///
/// On iOS 17+ Apple separates full access from write-only access; ADHDone asks for
/// full access (it reads AND writes), which also covers writing.
@objc(CalendarBridge)
public class CalendarBridge: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CalendarBridge"
    public let jsName = "CalendarBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "listCalendars", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listWritableCalendars", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSyncCalendars", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setExportEnabled", returnType: CAPPluginReturnPromise)
    ]

    private static let store = EKEventStore()
    private let work = DispatchQueue(label: "adhdone.calendar", qos: .userInitiated)

    // MARK: - Permission

    private func hasFullAccess() -> Bool {
        let status = EKEventStore.authorizationStatus(for: .event)
        if #available(iOS 17.0, *) {
            return status == .fullAccess
        }
        return status == .authorized
    }

    private func permissionWord() -> String {
        let status = EKEventStore.authorizationStatus(for: .event)
        if #available(iOS 17.0, *) {
            switch status {
            case .fullAccess: return "granted"
            case .notDetermined: return "prompt"
            default: return "denied"
            }
        }
        switch status {
        case .authorized: return "granted"
        case .notDetermined: return "prompt"
        default: return "denied"
        }
    }

    private func permissionResult() -> [String: Any] {
        let word = permissionWord()
        return ["calendar": word, "calendarWrite": word]
    }

    private func askForAccess(_ done: @escaping (Bool) -> Void) {
        if hasFullAccess() { done(true); return }
        if #available(iOS 17.0, *) {
            CalendarBridge.store.requestFullAccessToEvents { granted, _ in done(granted) }
        } else {
            CalendarBridge.store.requestAccess(to: .event) { granted, _ in done(granted) }
        }
    }

    @objc public override func checkPermissions(_ call: CAPPluginCall) {
        call.resolve(permissionResult())
    }

    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        askForAccess { _ in
            // Apple's prompt shows once; afterwards only Settings can change the answer.
            call.resolve(self.permissionResult())
        }
    }

    // MARK: - Calendars

    private static func isHolidayFeed(_ cal: EKCalendar) -> Bool {
        let name = cal.title.trimmingCharacters(in: .whitespaces).lowercased()
        return name.hasPrefix("holidays in ") || name.hasPrefix("holiday in ") || cal.type == .birthday
    }

    private static func calendarRow(_ cal: EKCalendar, primary: EKCalendar?) -> [String: Any] {
        let source = cal.source
        var accountType = "local"
        switch source?.sourceType {
        case .some(.calDAV): accountType = (source?.title.lowercased().contains("icloud") ?? false) ? "icloud" : "caldav"
        case .some(.exchange): accountType = "exchange"
        case .some(.subscribed): accountType = "subscribed"
        case .some(.birthdays): accountType = "birthdays"
        case .some(.mobileMe): accountType = "icloud"
        default: accountType = "local"
        }
        return [
            "id": cal.calendarIdentifier,
            "name": cal.title,
            "account": source?.title ?? "",
            "accountType": accountType,
            "color": colorHex(cal.cgColor),
            "visible": true,
            "isPrimary": primary != nil && primary?.calendarIdentifier == cal.calendarIdentifier,
            "owner": source?.title ?? ""
        ]
    }

    private static func colorHex(_ cg: CGColor?) -> String {
        guard let cg = cg, let comps = cg.components, comps.count >= 3 else { return "" }
        let r = Int(round(comps[0] * 255)), g = Int(round(comps[1] * 255)), b = Int(round(comps[2] * 255))
        return String(format: "#%02X%02X%02X", r, g, b)
    }

    @objc func listCalendars(_ call: CAPPluginCall) {
        guard hasFullAccess() else { call.resolve(["granted": false, "calendars": []]); return }
        let primary = CalendarBridge.store.defaultCalendarForNewEvents
        let rows = CalendarBridge.store.calendars(for: .event)
            .filter { !CalendarBridge.isHolidayFeed($0) }
            .map { CalendarBridge.calendarRow($0, primary: primary) }
        call.resolve(["granted": true, "calendars": rows])
    }

    @objc func listWritableCalendars(_ call: CAPPluginCall) {
        guard hasFullAccess() else { call.resolve(["granted": false, "calendars": []]); return }
        let primary = CalendarBridge.store.defaultCalendarForNewEvents
        let rows = CalendarBridge.store.calendars(for: .event)
            .filter { $0.allowsContentModifications && $0.type != .birthday && $0.type != .subscription && !CalendarBridge.isHolidayFeed($0) }
            .map { CalendarBridge.calendarRow($0, primary: primary) }
        call.resolve(["granted": true, "calendars": rows])
    }

    // On Android these hand settings to a background worker. iPhone has no such
    // worker: the app syncs when it opens. Accepted so the web app's calls succeed.
    @objc func setSyncCalendars(_ call: CAPPluginCall) {
        let ids = call.getArray("calendarIds", String.self) ?? []
        call.resolve(["watching": !ids.isEmpty && hasFullAccess()])
    }

    @objc func setExportEnabled(_ call: CAPPluginCall) {
        call.resolve(["ok": true])
    }

    // MARK: - Reading

    @objc func listEvents(_ call: CAPPluginCall) {
        guard hasFullAccess() else { call.resolve(["granted": false, "events": []]); return }
        let ids = Set(call.getArray("calendarIds", String.self) ?? [])
        let days = max(1, min(730, call.getInt("days") ?? 365))
        work.async {
            let store = CalendarBridge.store
            let wanted = store.calendars(for: .event).filter { ids.isEmpty || ids.contains($0.calendarIdentifier) }
            guard !wanted.isEmpty else { call.resolve(["granted": true, "events": []]); return }
            let start = Calendar.current.date(byAdding: .day, value: -7, to: Date()) ?? Date()
            let end = Calendar.current.date(byAdding: .day, value: days, to: Date()) ?? Date()
            let predicate = store.predicateForEvents(withStart: start, end: end, calendars: wanted)
            let occurrences = store.events(matching: predicate).sorted { $0.startDate < $1.startDate }

            // One row per underlying event: a series once (its first occurrence in
            // the window gives nextBegin/nextEnd), an edited occurrence on its own.
            var rows: [[String: Any]] = []
            var seen = Set<String>()
            for ev in occurrences {
                guard let eid = ev.eventIdentifier else { continue }
                let detached = ev.isDetached
                let key = detached ? "\(eid)#\(Int64(ev.occurrenceDate?.timeIntervalSince1970 ?? 0))" : eid
                if seen.contains(key) { continue }
                seen.insert(key)
                let allDay = ev.isAllDay
                let begin = CalendarBridge.ms(ev.startDate, allDay: allDay)
                let finish = CalendarBridge.ms(ev.endDate, allDay: allDay, end: true)
                var row: [String: Any] = [
                    "id": detached ? key : eid,
                    "calendarId": ev.calendar.calendarIdentifier,
                    "calendarName": ev.calendar.title,
                    "title": ev.title ?? "",
                    "description": ev.notes ?? "",
                    "location": ev.location ?? "",
                    "allDay": allDay,
                    "dtstart": begin,
                    "dtend": finish,
                    "duration": "",
                    "rrule": detached ? "" : CalendarBridge.rrule(ev),
                    "timezone": ev.timeZone?.identifier ?? TimeZone.current.identifier,
                    "originalId": detached ? eid : "",
                    "originalInstanceTime": detached ? CalendarBridge.ms(ev.occurrenceDate, allDay: allDay) : 0,
                    "organizer": ev.organizer?.name ?? "",
                    "syncId": ev.calendarItemExternalIdentifier ?? "",
                    "nextBegin": begin,
                    "nextEnd": finish
                ]
                if !detached && ev.hasRecurrenceRules {
                    // The series' own first start, so the server can key it the same way every time.
                    if let master = store.event(withIdentifier: eid) {
                        row["dtstart"] = CalendarBridge.ms(master.startDate, allDay: allDay)
                        row["dtend"] = CalendarBridge.ms(master.endDate, allDay: allDay, end: true)
                    }
                }
                rows.append(row)
            }
            call.resolve(["granted": true, "events": rows])
        }
    }

    /// Epoch ms. All-day events are reported at UTC midnight of their local day
    /// (what Android's provider does), so the server treats both phones alike.
    private static func ms(_ date: Date?, allDay: Bool, end: Bool = false) -> Int64 {
        guard let date = date else { return 0 }
        if allDay {
            var cal = Calendar(identifier: .gregorian)
            cal.timeZone = TimeZone.current
            var comps = cal.dateComponents([.year, .month, .day], from: end ? date.addingTimeInterval(-1) : date)
            var utc = Calendar(identifier: .gregorian)
            utc.timeZone = TimeZone(identifier: "UTC")!
            comps.hour = 0; comps.minute = 0; comps.second = 0
            var midnight = utc.date(from: comps) ?? date
            if end { midnight = midnight.addingTimeInterval(86_400) }
            return Int64(midnight.timeIntervalSince1970 * 1000)
        }
        return Int64(date.timeIntervalSince1970 * 1000)
    }

    /// EventKit's rule as an RFC 5545 RRULE body (no "RRULE:" prefix; the server adds it).
    private static func rrule(_ ev: EKEvent) -> String {
        guard let rule = ev.recurrenceRules?.first else { return "" }
        var parts: [String] = []
        switch rule.frequency {
        case .daily: parts.append("FREQ=DAILY")
        case .weekly: parts.append("FREQ=WEEKLY")
        case .monthly: parts.append("FREQ=MONTHLY")
        case .yearly: parts.append("FREQ=YEARLY")
        @unknown default: parts.append("FREQ=WEEKLY")
        }
        if rule.interval > 1 { parts.append("INTERVAL=\(rule.interval)") }
        if let endRule = rule.recurrenceEnd {
            if let until = endRule.endDate {
                let f = DateFormatter()
                f.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
                f.timeZone = TimeZone(identifier: "UTC")
                parts.append("UNTIL=\(f.string(from: until))")
            } else if endRule.occurrenceCount > 0 {
                parts.append("COUNT=\(endRule.occurrenceCount)")
            }
        }
        if let days = rule.daysOfTheWeek, !days.isEmpty {
            let names = ["", "SU", "MO", "TU", "WE", "TH", "FR", "SA"]
            let list = days.map { d -> String in
                let n = names[max(1, min(7, d.dayOfTheWeek.rawValue))]
                return d.weekNumber != 0 ? "\(d.weekNumber)\(n)" : n
            }
            parts.append("BYDAY=\(list.joined(separator: ","))")
        }
        if let monthDays = rule.daysOfTheMonth, !monthDays.isEmpty {
            parts.append("BYMONTHDAY=\(monthDays.map { "\($0)" }.joined(separator: ","))")
        }
        if let months = rule.monthsOfTheYear, !months.isEmpty {
            parts.append("BYMONTH=\(months.map { "\($0)" }.joined(separator: ","))")
        }
        if let pos = rule.setPositions, !pos.isEmpty {
            parts.append("BYSETPOS=\(pos.map { "\($0)" }.joined(separator: ","))")
        }
        return parts.joined(separator: ";")
    }

    // MARK: - Writing (export)

    @objc func writeEvents(_ call: CAPPluginCall) {
        guard hasFullAccess() else { call.resolve(["granted": false, "results": []]); return }
        guard let calendarId = call.getString("calendarId"), !calendarId.isEmpty else {
            call.reject("calendarId is required")
            return
        }
        let events = (call.getArray("events") ?? []).compactMap { $0 as? [String: Any] }
        work.async {
            let store = CalendarBridge.store
            guard let calendar = store.calendar(withIdentifier: calendarId), calendar.allowsContentModifications else {
                call.resolve(["granted": true, "results": events.map { ["key": $0["key"] ?? "", "ok": false, "error": "calendar_gone"] }])
                return
            }
            var results: [[String: Any]] = []
            for e in events {
                let key = (e["key"] as? String) ?? ""
                let startMs = CalendarBridge.number(e["startMs"])
                let endMs = CalendarBridge.number(e["endMs"])
                guard startMs > 0 else { results.append(["key": key, "ok": false, "error": "no_start"]); continue }
                let allDay = (e["allDay"] as? Bool) ?? false
                let existingId = (e["deviceEventId"] as? String) ?? ""
                let ev: EKEvent
                if !existingId.isEmpty, let found = store.event(withIdentifier: existingId) {
                    ev = found
                } else {
                    ev = EKEvent(eventStore: store)
                }
                ev.calendar = calendar
                ev.title = (e["title"] as? String) ?? ""
                ev.notes = (e["description"] as? String) ?? ""
                ev.location = (e["location"] as? String) ?? ""
                ev.isAllDay = allDay
                if allDay {
                    // UTC-midnight days from the server -> local days on the phone.
                    ev.startDate = CalendarBridge.localDay(fromUtcMs: startMs)
                    let endDay = CalendarBridge.localDay(fromUtcMs: max(startMs, endMs - 86_400_000))
                    ev.endDate = endDay
                } else {
                    ev.startDate = Date(timeIntervalSince1970: Double(startMs) / 1000)
                    ev.endDate = Date(timeIntervalSince1970: Double(max(endMs, startMs + 60_000)) / 1000)
                    if let tz = e["timezone"] as? String, let zone = TimeZone(identifier: tz) { ev.timeZone = zone }
                }
                ev.alarms = nil
                let reminder = Int(CalendarBridge.number(e["reminderMinutes"]))
                if reminder >= 0 && !allDay { ev.addAlarm(EKAlarm(relativeOffset: TimeInterval(-reminder * 60))) }
                // A repeating ADHDone event is written as one series (same as Android).
                let rule = CalendarBridge.recurrenceRule(from: (e["rrule"] as? String) ?? "")
                let wasSeries = ev.hasRecurrenceRules
                ev.recurrenceRules = rule.map { [$0] }
                do {
                    try store.save(ev, span: (rule != nil || wasSeries) ? .futureEvents : .thisEvent, commit: true)
                    results.append(["key": key, "ok": true, "deviceEventId": ev.eventIdentifier ?? "", "hash": (e["hash"] as? String) ?? ""])
                } catch {
                    results.append(["key": key, "ok": false, "error": error.localizedDescription])
                }
            }
            call.resolve(["granted": true, "results": results])
        }
    }

    @objc func deleteEvents(_ call: CAPPluginCall) {
        guard hasFullAccess() else { call.resolve(["granted": false, "deleted": 0]); return }
        let ids = call.getArray("deviceEventIds", String.self) ?? []
        work.async {
            let store = CalendarBridge.store
            var deleted = 0
            for id in ids {
                guard let ev = store.event(withIdentifier: id) else { continue }
                // A series ADHDone wrote goes as a whole, not one day of it.
                let span: EKSpan = ev.hasRecurrenceRules ? .futureEvents : .thisEvent
                do { try store.remove(ev, span: span, commit: true); deleted += 1 } catch { /* already gone */ }
            }
            call.resolve(["granted": true, "deleted": deleted])
        }
    }

    /// "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231" -> EKRecurrenceRule.
    /// Covers what ADHDone writes (daily, weekdays, weekly, every other week,
    /// monthly, yearly, with an optional end date or count).
    static func recurrenceRule(from raw: String) -> EKRecurrenceRule? {
        let body = raw.replacingOccurrences(of: "RRULE:", with: "", options: .caseInsensitive)
        guard !body.isEmpty else { return nil }
        var parts: [String: String] = [:]
        for p in body.split(separator: ";") {
            let kv = p.split(separator: "=", maxSplits: 1).map(String.init)
            if kv.count == 2 { parts[kv[0].uppercased()] = kv[1] }
        }
        let freq: EKRecurrenceFrequency
        switch parts["FREQ"]?.uppercased() {
        case "DAILY": freq = .daily
        case "WEEKLY": freq = .weekly
        case "MONTHLY": freq = .monthly
        case "YEARLY": freq = .yearly
        default: return nil
        }
        let interval = max(1, Int(parts["INTERVAL"] ?? "1") ?? 1)
        let dayMap: [String: EKWeekday] = ["SU": .sunday, "MO": .monday, "TU": .tuesday, "WE": .wednesday, "TH": .thursday, "FR": .friday, "SA": .saturday]
        let days: [EKRecurrenceDayOfWeek]? = parts["BYDAY"].map { list in
            list.split(separator: ",").compactMap { code in
                let letters = String(code.filter { $0.isLetter }).uppercased()
                return dayMap[letters].map { EKRecurrenceDayOfWeek($0) }
            }
        }
        var end: EKRecurrenceEnd? = nil
        if let until = parts["UNTIL"], until.count >= 8,
           let y = Int(until.prefix(4)), let m = Int(until.dropFirst(4).prefix(2)), let d = Int(until.dropFirst(6).prefix(2)) {
            var c = DateComponents(); c.year = y; c.month = m; c.day = d; c.hour = 23; c.minute = 59
            if let date = Calendar.current.date(from: c) { end = EKRecurrenceEnd(end: date) }
        } else if let count = Int(parts["COUNT"] ?? ""), count > 0 {
            end = EKRecurrenceEnd(occurrenceCount: count)
        }
        return EKRecurrenceRule(recurrenceWith: freq, interval: interval,
                                daysOfTheWeek: (days?.isEmpty ?? true) ? nil : days,
                                daysOfTheMonth: nil, monthsOfTheYear: nil, weeksOfTheYear: nil,
                                daysOfTheYear: nil, setPositions: nil, end: end)
    }

    private static func number(_ v: Any?) -> Int64 {
        if let n = v as? Int64 { return n }
        if let n = v as? Int { return Int64(n) }
        if let n = v as? Double { return Int64(n) }
        if let n = v as? NSNumber { return n.int64Value }
        if let s = v as? String, let n = Double(s) { return Int64(n) }
        return 0
    }

    private static func localDay(fromUtcMs ms: Int64) -> Date {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        let comps = utc.dateComponents([.year, .month, .day], from: Date(timeIntervalSince1970: Double(ms) / 1000))
        var local = Calendar(identifier: .gregorian)
        local.timeZone = TimeZone.current
        return local.date(from: comps) ?? Date(timeIntervalSince1970: Double(ms) / 1000)
    }
}
