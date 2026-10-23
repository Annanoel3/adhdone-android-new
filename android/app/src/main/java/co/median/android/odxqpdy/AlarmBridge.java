package co.median.android.odxqpdy;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.List;

/**
 * AlarmBridge — the web app's handle on real, on-device alarms.
 *
 * The web app decides which tasks deserve an alarm and when it should ring; it sends
 * the WHOLE set every time tasks change:
 *
 *   window.Capacitor.Plugins.AlarmBridge.sync({
 *     alarms: [{ id, taskId, title, at }]   // at = epoch milliseconds
 *   })
 *
 * Native books them with AlarmManager (exact when allowed), keeps them across
 * reboots, and rings them through AlarmService whether or not the phone is online.
 * Anything not in the latest set is cancelled. The web app's presence check
 * (`!!window.Capacitor?.Plugins?.AlarmBridge`) is what "supportsAlarms" means.
 *
 * getStatus() reports the three things Android may still be withholding — exact
 * alarms, full-screen notifications, battery-optimisation exemption — so the web
 * app can explain and offer the matching settings screen. It never opens a settings
 * screen on its own. It also reports when an alarm last rang on this phone
 * (lastRangAt, rangCount), which the web app uses to time its one question about
 * keeping full-screen reminders until after the person has heard one.
 *
 * setSound({ url, name }) is the user's choice of ring sound (a preset or their own
 * upload). Native downloads it once and rings from the local copy; an empty url
 * goes back to the phone's default alarm tone. See AlarmSound. The url "speak:"
 * is the spoken alarm: the phone reads the reminder out loud (AlarmSpeech);
 * previewSpeech({ text }) lets Settings play a sample of that voice.
 *
 * quietFor({ hours, extend? }), quietOff() and quietStatus() are "Quiet notifications"
 * in the side menu: the same 1, 2 or 3 hour quiet as the pinned notification's and the
 * widget's buttons (ReminderPause). The web app shows that menu item only when
 * quietFor exists, so older builds never offer it.
 */
@CapacitorPlugin(name = "AlarmBridge")
public class AlarmBridge extends Plugin {

    private static final String TAG = "ADHDone";
    private AlarmSpeech previewSpeech;
    private PluginCall previewCall;

    @PluginMethod
    public void sync(PluginCall call) {
        JSArray alarms = call.getArray("alarms");
        JSONArray incoming = alarms != null ? alarms : new JSONArray();
        // Every active task's id (web code from 1.3.14 on); null when not sent.
        java.util.Set<String> activeTaskIds = null;
        JSArray ids = call.getArray("activeTaskIds");
        if (ids != null) {
            activeTaskIds = new java.util.HashSet<>();
            for (int i = 0; i < ids.length(); i++) {
                String id = ids.optString(i, "");
                if (!id.isEmpty()) {
                    activeTaskIds.add(id);
                }
            }
        }
        // Their quiet hours' end (web code from build 39 on): a second Later's
        // break runs until then (LaterBreak), and the wake-up watch looks from
        // a few hours before it (WakeWatch).
        String quietEnd = call.getString("quietEnd", null);
        if (quietEnd != null) {
            WakeWatch.setQuietEnd(getContext(), quietEnd);
        }
        try {
            int booked = AlarmScheduler.sync(getContext(), incoming, activeTaskIds);
            // A chosen sound whose download failed earlier gets another quiet try.
            AlarmSound.ensureDownloaded(getContext(), null);
            // Anything still queued for the server goes now, and the wake-up
            // watch's 15-minute check is kept booked while it's on.
            if (ChoiceReports.size(getContext()) > 0) {
                ChoiceSyncWorker.kick(getContext());
            }
            if (WakeWatch.enabled(getContext())) {
                WakeWatchWorker.schedule(getContext());
            }
            JSObject ret = new JSObject();
            ret.put("booked", booked);
            ret.put("exactAlarms", AlarmScheduler.canScheduleExact(getContext()));
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "AlarmBridge.sync failed", e);
            call.reject("sync failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context ctx = getContext();
        JSObject ret = new JSObject();
        ret.put("supported", true);
        ret.put("exactAlarms", AlarmScheduler.canScheduleExact(ctx));
        ret.put("fullScreen", canUseFullScreen(ctx));
        ret.put("notifications", NotificationManagerCompat.from(ctx).areNotificationsEnabled());
        ret.put("ignoringBatteryOptimizations", isIgnoringBatteryOptimizations(ctx));
        // "Display over other apps": without it Android shows the alarm as a
        // banner while the phone is in use instead of taking over the screen.
        ret.put("overlay", AlarmService.canDrawOverlays(ctx));
        ret.put("booked", countBooked(ctx));
        ret.put("ringing", AlarmService.isRinging(currentRingingId()));
        ret.put("soundUrl", AlarmSound.url(ctx));
        ret.put("soundName", AlarmSound.name(ctx));
        ret.put("soundReady", AlarmSound.ready(ctx));
        // When an alarm last rang here (epoch ms, 0 = never) and how many have
        // rung in all. Read-only facts about this phone.
        ret.put("lastRangAt", AlarmService.lastRangAt(ctx));
        ret.put("rangCount", AlarmService.rangCount(ctx));
        call.resolve(ret);
    }

    /**
     * Chooses the ring sound. url "" = the phone's default alarm tone. Resolves once the
     * file is on disk (or known to have failed): { result: cleared|cached|downloaded|failed, ready }.
     */
    @PluginMethod
    public void setSound(final PluginCall call) {
        String url = call.getString("url", "");
        String name = call.getString("name", "");
        final Context ctx = getContext();
        AlarmSound.set(ctx, url, name, new AlarmSound.Callback() {
            @Override
            public void done(String result) {
                JSObject ret = new JSObject();
                ret.put("result", result);
                ret.put("ready", AlarmSound.ready(ctx));
                call.resolve(ret);
            }
        });
    }

    /**
     * Speaks a sample line once, in the voice the spoken alarm would use, at
     * media volume. Resolves when it has finished: { spoke } — false when no
     * speech engine could start (the web app then says so). A second preview
     * cuts the first one short.
     */
    @PluginMethod
    public void previewSpeech(final PluginCall call) {
        String text = call.getString("text", "");
        stopPreview(false);
        previewCall = call;
        previewSpeech = new AlarmSpeech(getContext());
        previewSpeech.start(AlarmSpeech.clean(text), false, android.media.AudioAttributes.USAGE_MEDIA,
                new AlarmSpeech.Listener() {
                    @Override
                    public void finished(boolean spoke) {
                        PluginCall c = previewCall;
                        previewCall = null;
                        previewSpeech = null;
                        if (c != null) {
                            JSObject ret = new JSObject();
                            ret.put("spoke", spoke);
                            c.resolve(ret);
                        }
                    }
                });
    }

    /**
     * "Only vibrate when my phone is on silent, vibrate or Do Not Disturb" —
     * { on }. Read by the ringing at the moment an alarm goes off (AlarmQuiet).
     */
    @PluginMethod
    public void setQuietVibrate(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        AlarmQuiet.set(getContext(), on);
        JSObject ret = new JSObject();
        ret.put("on", on);
        call.resolve(ret);
    }

    /**
     * Which quiet the vibrate-only choice covers — { when }: "silent" (the ringer
     * is on silent or vibrate), "dnd" (Do Not Disturb is on), "both" (either),
     * or "off" (always ring out loud). setQuietVibrate({ on }) still works and
     * leaves this part alone, so an older copy of the app sending only on/off
     * never undoes the pick. Builds before 1.3.11 don't have this method.
     */
    @PluginMethod
    public void setQuietWhen(PluginCall call) {
        String when = call.getString("when", "off");
        boolean on = AlarmQuiet.WHEN_SILENT.equals(when) || AlarmQuiet.WHEN_DND.equals(when)
                || AlarmQuiet.WHEN_BOTH.equals(when);
        if (on) {
            AlarmQuiet.setWhen(getContext(), when);
        }
        AlarmQuiet.set(getContext(), on);
        JSObject ret = new JSObject();
        ret.put("when", on ? AlarmQuiet.when(getContext()) : "off");
        call.resolve(ret);
    }

    /**
     * "Silent alarms during events" — { on }. While an event on the calendar is
     * happening, rings vibrate and show with no sound (AlarmQuiet).
     */
    @PluginMethod
    public void setEventQuiet(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        AlarmQuiet.setEventQuiet(getContext(), on);
        JSObject ret = new JSObject();
        ret.put("on", on);
        call.resolve(ret);
    }

    /** The upcoming events for the choice above — { windows: [{ start, end }] } in epoch ms. */
    @PluginMethod
    public void setEventWindows(PluginCall call) {
        JSArray windows = call.getArray("windows");
        AlarmQuiet.setEventWindows(getContext(), windows != null ? windows : new JSArray());
        JSObject ret = new JSObject();
        ret.put("count", windows != null ? windows.length() : 0);
        call.resolve(ret);
    }

    /**
     * "Quiet notifications" in the app's side menu — the same quiet as the pinned
     * notification's and the widget's buttons (ReminderPause): { hours: 1-3, extend? }.
     * extend = add the hours onto a quiet already running ("Add 1 hour"). Resolves
     * with the new state, like quietStatus().
     */
    @PluginMethod
    public void quietFor(PluginCall call) {
        Integer hours = call.getInt("hours", 1);
        if (hours == null || hours < 1 || hours > 3) {
            call.reject("hours must be 1, 2 or 3");
            return;
        }
        boolean extend = Boolean.TRUE.equals(call.getBoolean("extend", false));
        ReminderPause.silence(getContext(), hours, extend);
        call.resolve(quietState());
    }

    /** "Sound back on": ends the quiet now. */
    @PluginMethod
    public void quietOff(PluginCall call) {
        ReminderPause.unsilence(getContext());
        call.resolve(quietState());
    }

    /**
     * { quiet, until, untilLabel } — until in epoch ms (0 when not quiet), untilLabel
     * in the phone's own clock format ("4:30 PM"). The quiet can also be started or
     * ended from the pinned notification or the widget, so the app asks each time.
     */
    @PluginMethod
    public void quietStatus(PluginCall call) {
        call.resolve(quietState());
    }

    private JSObject quietState() {
        Context ctx = getContext();
        boolean quiet = ReminderPause.isPaused(ctx);
        JSObject ret = new JSObject();
        ret.put("quiet", quiet);
        ret.put("until", quiet ? ReminderPause.until(ctx) : 0L);
        ret.put("untilLabel", quiet ? ReminderPause.untilLabel(ctx) : "");
        return ret;
    }

    /** Stops a running preview. */
    @PluginMethod
    public void stopSpeech(PluginCall call) {
        stopPreview(true);
        call.resolve();
    }

    private void stopPreview(boolean spoke) {
        if (previewSpeech != null) {
            previewSpeech.stop();
            previewSpeech = null;
        }
        PluginCall c = previewCall;
        previewCall = null;
        if (c != null) {
            JSObject ret = new JSObject();
            ret.put("spoke", spoke);
            ret.put("stopped", true);
            c.resolve(ret);
        }
    }

    /**
     * The look of the full-screen alarm, copied from the web app's current theme:
     * colors (hex strings, 1-8, drawn as a gradient in order), angle (CSS
     * degrees), text, muted, accent, onAccent, and image (a URL of the page's
     * background artwork, shown behind a dark scrim once downloaded). Empty
     * colors and no image clears it and the built-in look returns.
     */
    @PluginMethod
    public void setTheme(PluginCall call) {
        try {
            JSArray arr = call.getArray("colors");
            List<String> colors = new ArrayList<>();
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    Object o = arr.opt(i);
                    if (o != null) {
                        colors.add(String.valueOf(o));
                    }
                }
            }
            String image = call.getString("image", "");
            if (colors.isEmpty() && (image == null || image.trim().isEmpty())) {
                AlarmTheme.clear(getContext());
            } else {
                AlarmTheme.set(getContext(), colors, call.getInt("angle", 135),
                        call.getString("text", ""), call.getString("muted", ""),
                        call.getString("accent", ""), call.getString("onAccent", ""), image);
            }
            JSObject ret = new JSObject();
            ret.put("set", AlarmTheme.isSet(getContext()));
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "AlarmBridge.setTheme failed", e);
            call.reject("setTheme failed: " + e.getMessage());
        }
    }

    /**
     * What happened to alarms since the app last asked: one row per alarm with
     * unreported snoozes, an ignored ring-out, or a dismissal. Each row is handed
     * over once. The web app adds them to the task's counters — data only, never
     * a change to what the task reminds about.
     */
    /**
     * What rang on this phone (RingLog): full-screen alarms and reminders that
     * showed with sound, newest first, with how each one ended. `days` back
     * (1–7, default 2). Read-only.
     */
    @PluginMethod
    public void ringLog(PluginCall call) {
        try {
            int days = call.getInt("days", 2);
            JSONArray rows = RingLog.rows(getContext(), days);
            JSArray out = new JSArray();
            for (int i = 0; i < rows.length(); i++) {
                out.put(rows.get(i));
            }
            JSObject ret = new JSObject();
            ret.put("rows", out);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "AlarmBridge.ringLog failed", e);
            call.reject("ringLog failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void drainActivity(PluginCall call) {
        java.util.List<AlarmStore.Entry> all = AlarmStore.load(getContext());
        JSArray rows = new JSArray();
        boolean changed = false;
        for (AlarmStore.Entry e : all) {
            if (!e.hasUnreportedActivity()) {
                continue;
            }
            // Only what was never handed over before: the server's report queue
            // (ChoiceReports) carries every choice from build 39 on, so this is
            // what an older entry still held. Reported once, never again (it
            // used to send the running total each time, counting snoozes twice).
            JSObject row = new JSObject();
            row.put("taskId", e.taskId);
            row.put("snoozes", Math.max(0, e.snoozes - e.sentSnoozes));
            row.put("dismissed", e.dismissed && !e.sentDismissed);
            row.put("ignored", Math.max(0, e.ignored - e.sentIgnored));
            row.put("later", Math.max(0, e.laters - e.sentLaters));
            rows.put(row);
            e.sentSnoozes = e.snoozes;
            e.sentIgnored = e.ignored;
            e.sentDismissed = e.dismissed;
            e.sentLaters = e.laters;
            e.reported = true;
            changed = true;
        }
        if (changed) {
            AlarmStore.save(getContext(), all);
        }
        // "Later" tapped on a smart nudge's notification (TaskActions): same row shape.
        for (java.util.Map.Entry<String, Integer> l : TaskActions.drainLaters(getContext()).entrySet()) {
            JSObject row = new JSObject();
            row.put("taskId", l.getKey());
            row.put("snoozes", 0);
            row.put("dismissed", false);
            row.put("ignored", 0);
            row.put("later", l.getValue());
            rows.put(row);
        }
        JSObject ret = new JSObject();
        ret.put("activity", rows);
        call.resolve(ret);
    }

    /**
     * "Notice when I wake up" (Settings, next to quiet hours): is Usage access
     * on, and is the watch on? { available, hasAccess, enabled }.
     */
    @PluginMethod
    public void wakeWatchStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", true);
        ret.put("hasAccess", WakeWatch.hasAccess(getContext()));
        ret.put("enabled", WakeWatch.enabled(getContext()));
        call.resolve(ret);
    }

    /** Turn the wake-up watch on or off: { enabled, quietEnd? }. */
    @PluginMethod
    public void setWakeWatch(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        String quietEnd = call.getString("quietEnd", null);
        if (quietEnd != null) {
            WakeWatch.setQuietEnd(getContext(), quietEnd);
        }
        WakeWatch.setEnabled(getContext(), on && WakeWatch.hasAccess(getContext()));
        if (on) {
            final android.content.Context c = getContext().getApplicationContext();
            Thread t = new Thread(new Runnable() {
                @Override
                public void run() {
                    WakeWatch.checkAndReport(c);
                }
            }, "adhdone-wake");
            t.setDaemon(true);
            t.start();
        }
        JSObject ret = new JSObject();
        ret.put("hasAccess", WakeWatch.hasAccess(getContext()));
        ret.put("enabled", WakeWatch.enabled(getContext()));
        call.resolve(ret);
    }

    /** Android's Usage access screen, where the person switches it on for ADHDone. */
    @PluginMethod
    public void openUsageAccessSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
                .setData(Uri.parse("package:" + getContext().getPackageName()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(i);
            call.resolve(result("opened"));
        } catch (Exception e) {
            // Some phones only open the full list, not ADHDone's own page.
            launch(call, new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
    }

    /** Android 12+: the "Alarms & reminders" special access screen for this app. */
    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            call.resolve(result("notNeeded"));
            return;
        }
        Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                .setData(Uri.parse("package:" + getContext().getPackageName()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        launch(call, i);
    }

    /** Android 14+: the "full screen notifications" special access screen for this app. */
    @PluginMethod
    public void openFullScreenSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            call.resolve(result("notNeeded"));
            return;
        }
        Intent i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT)
                .setData(Uri.parse("package:" + getContext().getPackageName()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        launch(call, i);
    }

    /** The "Display over other apps" settings screen for this app (Android 6+). */
    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || AlarmService.canDrawOverlays(getContext())) {
            call.resolve(result("alreadyGranted"));
            return;
        }
        Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)
                .setData(Uri.parse("package:" + getContext().getPackageName()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        launch(call, i);
    }

    /** Asks the system to exempt the app from battery optimisation (One UI kills alarms otherwise). */
    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        if (isIgnoringBatteryOptimizations(getContext())) {
            call.resolve(result("alreadyGranted"));
            return;
        }
        Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                .setData(Uri.parse("package:" + getContext().getPackageName()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        launch(call, i);
    }

    /**
     * Books one alarm the phone owns outright: a timer's end (focus timer,
     * 5-minute sprint, launchpad). The task sync never lists these, so sync()
     * leaves them alone; booking the same id again simply moves it.
     *   { id, taskId?, title, heading?, body?, at (epoch ms), soundUrl?, noSnooze?,
     *     actions?: [{ label, path }] }   — up to three buttons shown in place of snooze
     * → { booked, exactAlarms }
     */
    @PluginMethod
    public void bookOwn(PluginCall call) {
        String id = call.getString("id", "");
        Double at = call.getDouble("at");
        if (id == null || id.trim().isEmpty() || at == null || at <= 0) {
            call.reject("id and at are required");
            return;
        }
        id = id.trim();
        if (!AlarmScheduler.isPhoneOwned(id)) {
            id = AlarmScheduler.TIMER_ALARM_PREFIX + id;
        }
        try {
            Context ctx = getContext();
            AlarmScheduler.cancel(ctx, id);
            AlarmStore.Entry e = new AlarmStore.Entry();
            e.id = id;
            e.taskId = nz(call.getString("taskId", ""));
            e.title = nz(call.getString("title", ""));
            e.heading = nz(call.getString("heading", ""));
            e.body = nz(call.getString("body", ""));
            e.at = at.longValue();
            e.originalAt = e.at;
            e.soundUrl = nz(call.getString("soundUrl", ""));
            e.noSnooze = Boolean.TRUE.equals(call.getBoolean("noSnooze", true));
            JSArray actions = call.getArray("actions");
            e.actionsJson = actions != null && actions.length() > 0 ? actions.toString() : "";
            AlarmStore.put(ctx, e);
            AlarmScheduler.schedule(ctx, e);
            // The timer's own sound is fetched now so it is on disk by the time it rings.
            AlarmSound.prefetch(ctx, e.soundUrl);
            JSObject ret = new JSObject();
            ret.put("booked", e.at > System.currentTimeMillis());
            ret.put("exactAlarms", AlarmScheduler.canScheduleExact(ctx));
            call.resolve(ret);
        } catch (Exception ex) {
            Log.e(TAG, "AlarmBridge.bookOwn failed", ex);
            call.reject("bookOwn failed: " + ex.getMessage());
        }
    }

    /** Cancels an alarm booked with bookOwn (a timer paused, reset or abandoned). Stops it if it is ringing. */
    @PluginMethod
    public void cancelOwn(PluginCall call) {
        String id = call.getString("id", "");
        if (id == null || id.trim().isEmpty()) {
            call.reject("id is required");
            return;
        }
        id = id.trim();
        if (!AlarmScheduler.isPhoneOwned(id)) {
            id = AlarmScheduler.TIMER_ALARM_PREFIX + id;
        }
        try {
            Context ctx = getContext();
            if (AlarmService.isRinging(id)) {
                Intent i = new Intent(ctx, AlarmService.class)
                        .setAction(AlarmService.ACTION_DISMISS)
                        .putExtra(AlarmScheduler.EXTRA_ALARM_ID, id);
                ctx.startService(i);
            }
            AlarmScheduler.cancel(ctx, id);
            AlarmStore.remove(ctx, id);
            call.resolve(result("cancelled"));
        } catch (Exception ex) {
            Log.e(TAG, "AlarmBridge.cancelOwn failed", ex);
            call.reject("cancelOwn failed: " + ex.getMessage());
        }
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    /** Stops a ring in progress (the user opened the app while it was going). Counts as dismissed. */
    @PluginMethod
    public void stopRinging(PluginCall call) {
        String id = currentRingingId();
        if (id == null) {
            call.resolve(result("notRinging"));
            return;
        }
        Intent i = new Intent(getContext(), AlarmService.class)
                .setAction(AlarmService.ACTION_DISMISS)
                .putExtra(AlarmScheduler.EXTRA_ALARM_ID, id);
        getContext().startService(i);
        call.resolve(result("stopped"));
    }

    private void launch(PluginCall call, Intent i) {
        try {
            getContext().startActivity(i);
            call.resolve(result("opened"));
        } catch (Exception e) {
            Log.w(TAG, "AlarmBridge: could not open settings screen", e);
            call.resolve(result("unavailable"));
        }
    }

    private static JSObject result(String outcome) {
        JSObject ret = new JSObject();
        ret.put("result", outcome);
        return ret;
    }

    private static boolean canUseFullScreen(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            return true;
        }
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        return nm != null && nm.canUseFullScreenIntent();
    }

    private static boolean isIgnoringBatteryOptimizations(Context ctx) {
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
    }

    private static int countBooked(Context ctx) {
        int n = 0;
        long now = System.currentTimeMillis();
        for (AlarmStore.Entry e : AlarmStore.load(ctx)) {
            if (!e.done && e.at > now) {
                n++;
            }
        }
        return n;
    }

    private String currentRingingId() {
        for (AlarmStore.Entry e : AlarmStore.load(getContext())) {
            if (AlarmService.isRinging(e.id)) {
                return e.id;
            }
        }
        return null;
    }
}
