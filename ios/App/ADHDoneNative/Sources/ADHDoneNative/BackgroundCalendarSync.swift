import Foundation
import UIKit
import EventKit
import BackgroundTasks
import CryptoKit
import ADHDoneShared

/// The phone's calendars come into ADHDone with the app closed (the twin of
/// Android's CalendarSyncWorker; Anna, Oct 19 2026: "calendar still doesn't
/// sync on it's own"). Two ways in:
///
///  - iOS's background app refresh (BGAppRefreshTask, identifier below, listed
///    under BGTaskSchedulerPermittedIdentifiers in Info.plist). iOS decides
///    when it runs — usually a few times a day for an app the person uses, at
///    times it has learned they open it — and gives it about 30 seconds. Each
///    run reads the ticked calendars and, when they differ from what was last
///    sent, hands the rows to the server's calendar import (syncGoogleCalendar,
///    source "device", the same import the app's Sync uses), then books the
///    next run.
///  - EventKit's "the store changed" notice while the app is open or in the
///    background: the same send, after a 30-second quiet spell so an account
///    syncing many events lands as one change.
///
/// The app's own sync on every open stays as it was; this only fills the gaps
/// in between. Which calendars: the app says so (CalendarBridge.setSyncCalendars)
/// on every open and after every tick; none ticked, nothing is watched.
///
/// An empty read where there were events is not believed for 6 hours (a
/// calendar account mid-sync can show nothing for a moment, and the import
/// takes a calendar's missing events as deleted ones). The same rows are not
/// sent twice within a day.
public final class BackgroundCalendarSync {
    public static let shared = BackgroundCalendarSync()
    public static let taskIdentifier = "com.mediocreatbest.adhdone.calendar"

    private static let days = 365
    private static let resendAfter: TimeInterval = 24 * 3600
    private static let emptyHold: TimeInterval = 6 * 3600
    private static let settle: TimeInterval = 30

    private let defaults = UserDefaults.standard
    private let hashKey = "adhdone_calendar_bg_hash"
    private let sentAtKey = "adhdone_calendar_bg_sent_at"
    private let countKey = "adhdone_calendar_bg_count"
    private let emptySinceKey = "adhdone_calendar_bg_empty_since"
    private let work = DispatchQueue(label: "adhdone.calendar.background", qos: .utility)
    private var settleTimer: DispatchWorkItem?
    private var registered = false

    private init() {}

    // MARK: - App start

    /// From AppDelegate.didFinishLaunching: register the task (must happen before
    /// the app finishes launching) and start listening for calendar changes.
    public func start() {
        guard !registered else { return }
        registered = true
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.taskIdentifier, using: nil) { [weak self] task in
            guard let self = self, let refresh = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            self.run(refresh)
        }
        NotificationCenter.default.addObserver(self, selector: #selector(storeChanged),
                                               name: .EKEventStoreChanged, object: CalendarBridge.store)
        NotificationCenter.default.addObserver(self, selector: #selector(wentToBackground),
                                               name: UIApplication.didEnterBackgroundNotification, object: nil)
        scheduleNext()
    }

    /// The ticked calendars changed (CalendarBridge.setSyncCalendars).
    func calendarsChanged(watching: Bool) {
        if watching {
            scheduleNext()
            sendSoon()
        } else {
            BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.taskIdentifier)
        }
    }

    // MARK: - Triggers

    @objc private func storeChanged() {
        sendSoon()
    }

    @objc private func wentToBackground() {
        scheduleNext()
    }

    /// Wait for the calendars to settle, then send once.
    private func sendSoon() {
        settleTimer?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.send { _ in } }
        settleTimer = item
        work.asyncAfter(deadline: .now() + Self.settle, execute: item)
    }

    /// Asks iOS for the next background run, about 4 hours out. iOS treats this
    /// as the earliest, not a promise.
    private func scheduleNext() {
        guard !CalendarBridge.syncCalendarIds().isEmpty else { return }
        let request = BGAppRefreshTaskRequest(identifier: Self.taskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 4 * 3600)
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            // Already booked, or background refresh is off for ADHDone in Settings.
        }
    }

    private func run(_ task: BGAppRefreshTask) {
        // Book the one after this first, so a slow send can't cost the next run.
        scheduleNext()
        task.expirationHandler = { [weak self] in
            self?.cancelInFlight()
            task.setTaskCompleted(success: false)
        }
        send { ok in task.setTaskCompleted(success: ok) }
    }

    // MARK: - Sending

    private var inFlight: URLSessionDataTask?
    private func cancelInFlight() {
        inFlight?.cancel()
        inFlight = nil
    }

    /// Reads the ticked calendars and sends them when they changed.
    /// `done(true)` also when there was nothing to send.
    private func send(_ done: @escaping (Bool) -> Void) {
        let ids = CalendarBridge.syncCalendarIds()
        guard !ids.isEmpty, CalendarBridge.hasFullAccessNow() else { done(true); return }
        // Signed out, or never signed in on this phone yet.
        guard let session = SharedSession.load() else { done(true); return }

        let rows = CalendarBridge.readRows(ids: Set(ids), days: Self.days)
        let now = Date()
        if rows.isEmpty && defaults.integer(forKey: countKey) != 0 && defaults.object(forKey: countKey) != nil {
            let since = defaults.double(forKey: emptySinceKey)
            if since == 0 {
                defaults.set(now.timeIntervalSince1970, forKey: emptySinceKey)
                done(true)
                return
            }
            if now.timeIntervalSince1970 - since < Self.emptyHold { done(true); return }
        } else if defaults.object(forKey: emptySinceKey) != nil {
            defaults.removeObject(forKey: emptySinceKey)
        }

        guard let rowsData = try? JSONSerialization.data(withJSONObject: rows, options: [.sortedKeys]) else { done(true); return }
        let digest = SHA256.hash(data: Data((ids.joined(separator: ",") + "|").utf8) + rowsData)
        let hash = digest.map { String(format: "%02x", $0) }.joined()
        if hash == defaults.string(forKey: hashKey),
           now.timeIntervalSince1970 - defaults.double(forKey: sentAtKey) < Self.resendAfter {
            done(true)
            return
        }

        let body: [String: Any] = [
            "source": "device",
            "calendarIds": ids,
            "rows": rows,
            "from": "phone_background"
        ]
        CaptureAPI.post(session, function: "syncGoogleCalendar", body: body) { [weak self] result in
            guard let self = self else { done(false); return }
            if result.isSuccess, (result.body?["in_progress"] as? Bool) == true {
                // Another sync (the app's own) holds the server's lock: another time.
                done(false)
                return
            }
            if result.isSuccess {
                self.defaults.set(hash, forKey: self.hashKey)
                self.defaults.set(now.timeIntervalSince1970, forKey: self.sentAtKey)
                self.defaults.set(rows.count, forKey: self.countKey)
                done(true)
                return
            }
            // A stale sign-in waits for the next app open, which stores a fresh
            // one; anything else is simply tried again on the next run.
            done(false)
        }
    }
}
