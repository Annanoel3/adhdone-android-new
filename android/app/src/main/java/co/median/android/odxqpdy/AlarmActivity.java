package co.median.android.odxqpdy;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.audiofx.LoudnessEnhancer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.lang.ref.WeakReference;

/**
 * The full-screen takeover. Launched by the alarm notification's full-screen intent
 * when the phone is locked or asleep (needs the "full screen notifications" special
 * access on Android 14+), or by tapping the notification.
 *
 * Shows over the lock screen with the screen switched on. Snooze 10 / 30 / 60 and
 * Dismiss are forwarded to AlarmService, which owns the sound and the store.
 * Dismiss also opens the app straight to that task, through the same in-app path
 * the home-screen widget uses.
 */
public class AlarmActivity extends Activity {

    private static final String TAG = "ADHDone";
    private static final long RING_MS = 60_000L;
    /** Set by the ringing notification's "Done" button: finish the task straight away. */
    static final String EXTRA_MARK_DONE = "adhdone_mark_done";

    private static WeakReference<AlarmActivity> showing = new WeakReference<>(null);
    // A button on this screen (or on its notification, through the service) was
    // used, or Home / Back already closed it: leaving now is not a new choice.
    private boolean answered = false;

    private String alarmId;
    private String taskId;
    // Three or more tasks ringing together: "Open the app" goes to their task list.
    private boolean openList = false;
    private String screen;

    // Only used when AlarmService is NOT ringing (it could not be started, see
    // AlarmReceiver): then this screen carries the looping sound itself.
    private MediaPlayer ownPlayer;
    private LoudnessEnhancer ownBoost;
    private AlarmSpeech ownSpeech;
    private Vibrator ownVibrator;
    private final Handler handler = new Handler(Looper.getMainLooper());
    // Rang out on this screen with no choice: stop, count it as ignored (the
    // service records that), change nothing else.
    private final Runnable ownRingOut = new Runnable() {
        @Override
        public void run() {
            stopOwnRinging();
            sendToService(AlarmService.ACTION_IGNORE, 0);
            finish();
        }
    };

    /** Called by AlarmService once the ringing has stopped, so a stale screen never lingers. */
    static void closeIfShowing(String id) {
        AlarmActivity a = showing.get();
        if (a != null && !a.isFinishing() && id != null && id.equals(a.alarmId)) {
            a.finish();
        }
    }

    /** Another task's alarm joined this one while it shows: show its name too. */
    static void refreshIfShowing(final String id) {
        final AlarmActivity a = showing.get();
        if (a == null || a.isFinishing() || id == null || !id.equals(a.alarmId)) {
            return;
        }
        a.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    a.showWords(AlarmStore.get(a, id));
                } catch (Exception ignored) {
                }
            }
        });
    }

    /** The words on the screen, with any tasks ringing together with this one. */
    private void showWords(AlarmStore.Entry e) {
        String title = e != null && !e.title.isEmpty() ? e.title : getString(R.string.alarm_title_fallback);
        String heading = e != null && e.heading != null && !e.heading.isEmpty() ? e.heading : title;
        String body = AlarmService.withCompanions(e, e != null && e.body != null ? e.body : "");
        TextView headingView = findViewById(R.id.alarm_heading);
        TextView titleView = findViewById(R.id.alarm_task_title);
        headingView.setText(heading);
        titleView.setText(body.isEmpty() ? title : body);
        if (!body.isEmpty()) {
            titleView.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 22);
        }
        // Ringing together with another task: the Done spot splits in two, one
        // half per task, in the same space one Done takes. One tap finishes that
        // task only; being reminded together doesn't mean finishing together
        // (Anna, Oct 10 2026). Three or more at once: no row of tiny buttons,
        // "Open the app" takes them to their task list instead.
        Button done = findViewById(R.id.alarm_done);
        if (done == null || e == null || !canMarkDone(e, e.taskId)) {
            return;
        }
        java.util.List<String> others = e.companionTaskIds();
        if (others.isEmpty()) {
            return;
        }
        android.view.ViewGroup parent = (android.view.ViewGroup) done.getParent();
        boolean split = "done-split".equals(parent.getTag());
        if (others.size() >= 2) {
            (split ? parent : done).setVisibility(View.GONE);
            Button open = findViewById(R.id.alarm_dismiss);
            if (open != null) {
                open.setText("Open the app");
            }
            openList = true;
            return;
        }
        final String otherTask = others.get(0);
        String otherTitle = e.companionTitles().isEmpty() ? "" : e.companionTitles().get(0);
        float px15 = android.util.TypedValue.applyDimension(android.util.TypedValue.COMPLEX_UNIT_SP, 15,
                getResources().getDisplayMetrics());
        done.setText("✓ " + shortTitle(e.title));
        done.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, px15);
        done.setMaxLines(2);
        if (split) {
            return;
        }
        LinearLayout row = new LinearLayout(this);
        row.setTag("done-split");
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setLayoutParams(new LinearLayout.LayoutParams((LinearLayout.LayoutParams) done.getLayoutParams()));
        int at = parent.indexOfChild(done);
        parent.removeView(done);
        done.setLayoutParams(new LinearLayout.LayoutParams(0, android.view.ViewGroup.LayoutParams.MATCH_PARENT, 1f));
        Button b = new Button(this);
        b.setTag("done:" + otherTask);
        b.setText("✓ " + shortTitle(otherTitle));
        b.setAllCaps(done.isAllCaps());
        b.setBackgroundTintList(done.getBackgroundTintList());
        b.setTextColor(done.getCurrentTextColor());
        b.setTypeface(done.getTypeface());
        b.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, px15);
        b.setMaxLines(2);
        LinearLayout.LayoutParams half = new LinearLayout.LayoutParams(0, android.view.ViewGroup.LayoutParams.MATCH_PARENT, 1f);
        half.setMarginStart(Math.round(12 * getResources().getDisplayMetrics().density));
        b.setLayoutParams(half);
        b.setOnClickListener(v -> markDoneFor(otherTask));
        row.addView(done);
        row.addView(b);
        parent.addView(row, at);
    }

    private static String shortTitle(String t) {
        String s = t == null ? "" : t.trim();
        return s.length() > 22 ? s.substring(0, 21) + "…" : s;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showOverLockScreen();
        setContentView(R.layout.activity_alarm);

        alarmId = getIntent().getStringExtra(AlarmScheduler.EXTRA_ALARM_ID);
        AlarmStore.Entry e = alarmId != null ? AlarmStore.get(this, alarmId) : null;
        taskId = e != null ? e.taskId : "";
        screen = e != null && e.screen != null ? e.screen : "";
        // The push notification's own title and body, when the web app sent
        // them: the alarm says what the notification would have said (plus any
        // other task ringing together with it).
        TextView titleView = findViewById(R.id.alarm_task_title);

        Button snooze10 = findViewById(R.id.alarm_snooze_10);
        Button snooze30 = findViewById(R.id.alarm_snooze_30);
        Button snooze60 = findViewById(R.id.alarm_snooze_60);
        Button dismiss = findViewById(R.id.alarm_dismiss);
        Button done = findViewById(R.id.alarm_done);
        Button later = findViewById(R.id.alarm_later);
        snooze10.setOnClickListener(v -> snooze(10));
        snooze30.setOnClickListener(v -> snooze(30));
        snooze60.setOnClickListener(v -> snooze(60));
        dismiss.setOnClickListener(v -> dismiss());
        // "Done": people finish the thing and forget to tick it off, then ignore
        // every reminder about it for the rest of the day. Only for a real task
        // (not a timer's end or a pushed moment with no task).
        if (canMarkDone(e, taskId)) {
            done.setOnClickListener(v -> markDone());
            // "Later": stop without picking a time; the task goes back to its
            // normal reminders (smart nudges decide when, for what they handle).
            later.setOnClickListener(v -> later());
        } else {
            done.setVisibility(android.view.View.GONE);
            later.setVisibility(android.view.View.GONE);
        }
        if (taskId.isEmpty()) {
            // Nothing to open: a pushed alarm about a moment, not a task (the
            // commute "time to leave"). "Open the task" would be a lie.
            dismiss.setText(R.string.alarm_action_dismiss_plain);
        } else if (e != null && e.openLabel != null && !e.openLabel.isEmpty()) {
            // The web app's words for this one (a birthday: "Send a text"). It
            // still opens the task's page, which is where the text is sent.
            dismiss.setText(e.openLabel);
        }
        if (e != null && e.event) {
            // An event (an appointment, Bike Night): it happens whether or not
            // they tap anything, so there is nothing to snooze, finish or put
            // off — "Got it" is the one button, and it only stops the ring.
            dismiss.setText(R.string.alarm_action_dismiss_plain);
            // One exception: an appointment worth recording notes from. The
            // web app's words for the second button ("Record notes") open the
            // event's page, where recording starts. Done's slot is used for it.
            if (e.openLabel != null && !e.openLabel.isEmpty() && !taskId.isEmpty()) {
                done.setText(e.openLabel);
                done.setOnClickListener(v -> openEventPage());
                done.setVisibility(android.view.View.VISIBLE);
            }
        }
        if (e != null && (e.noSnooze || e.event)) {
            // A timer's end or an event: nothing to put off, so only Stop is offered.
            snooze10.setVisibility(android.view.View.GONE);
            snooze30.setVisibility(android.view.View.GONE);
            snooze60.setVisibility(android.view.View.GONE);
            findViewById(R.id.alarm_snooze_label).setVisibility(android.view.View.GONE);
        }
        // The web app's own choices for this moment (the sprint's "Keep going" /
        // "I'm done") take the snooze buttons' places; each stops the ring and
        // hands the choice to the app. Stop stays as the plain way out.
        JSONArray actions = parseActions(e);
        if (actions != null) {
            Button[] slots = new Button[] { snooze10, snooze30, snooze60 };
            findViewById(R.id.alarm_snooze_label).setVisibility(android.view.View.GONE);
            for (int i = 0; i < slots.length; i++) {
                JSONObject a = i < actions.length() ? actions.optJSONObject(i) : null;
                String label = a != null ? a.optString("label", "") : "";
                final String path = a != null ? a.optString("path", "") : "";
                if (label.isEmpty() || path.isEmpty()) {
                    slots[i].setVisibility(android.view.View.GONE);
                    continue;
                }
                slots[i].setVisibility(android.view.View.VISIBLE);
                slots[i].setText(label);
                slots[i].setOnClickListener(v -> dismissTo(path));
            }
        }

        // Same colours as the app is currently themed with (see AlarmTheme).
        try {
            AlarmTheme.apply(this, findViewById(R.id.alarm_root),
                    findViewById(R.id.alarm_bg_image), findViewById(R.id.alarm_bg_scrim),
                    findViewById(R.id.alarm_heading), titleView,
                    findViewById(R.id.alarm_snooze_label),
                    new Button[] { snooze10, snooze30, snooze60 }, dismiss);
            // Done gets the same look as the big button.
            done.setBackgroundTintList(dismiss.getBackgroundTintList());
            done.setTextColor(dismiss.getCurrentTextColor());
            later.setBackgroundTintList(dismiss.getBackgroundTintList());
            later.setTextColor(dismiss.getCurrentTextColor());
        } catch (Exception ex) {
            Log.w(TAG, "AlarmActivity: theme not applied", ex);
        }
        showing = new WeakReference<>(this);
        showWords(e);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::backStopsRing);
        }
        if (getIntent().getBooleanExtra(EXTRA_MARK_DONE, false) && canMarkDone(e, taskId)) {
            markDone();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (alarmId == null || !AlarmService.isRinging(alarmId)) {
            AlarmStore.Entry e = alarmId != null ? AlarmStore.get(this, alarmId) : null;
            if (e == null || e.done) {
                // Opened late (e.g. from the notification after the ring already ended).
                finish();
                return;
            }
            // Still due but nothing is ringing: the service was refused. Ring here —
            // but only right when it came due, and never while ADHDone is silenced.
            // Opened later (an old notification tapped), it shows without a sound.
            boolean fresh = System.currentTimeMillis() - e.at <= RING_MS;
            if (fresh && !ReminderPause.isPaused(this)) {
                startOwnRinging();
            }
        }
    }

    @Override
    protected void onDestroy() {
        // Closed some other way while its alarm still rings from the service
        // (never by one of its buttons, never by the ring ending): the same as
        // Home, so the ring never goes on with nothing on screen to stop it.
        if (!answered && !isChangingConfigurations() && alarmId != null && AlarmService.isRinging(alarmId)) {
            tellServiceLeft("closed");
        }
        stopOwnRinging();
        if (showing.get() == this) {
            showing = new WeakReference<>(null);
        }
        super.onDestroy();
    }

    private void startOwnRinging() {
        // Already ringing here (a vibrate-only ring has no player or voice, so
        // the vibrator counts too — otherwise every onResume would restart it).
        if (ownPlayer != null || ownSpeech != null || ownVibrator != null) {
            return;
        }
        final AlarmStore.Entry e = alarmId != null ? AlarmStore.get(this, alarmId) : null;
        boolean ownPick = e != null && e.soundUrl != null && !e.soundUrl.trim().isEmpty();
        if (AlarmQuiet.vibrateOnly(this)) {
            // Silent / vibrate / Do Not Disturb and "only vibrate" was chosen:
            // no sound here either, just the vibration below.
        } else if (!ownPick && AlarmSpeech.chosen(this)) {
            // The spoken alarm (see AlarmSpeech); the tone only if no engine starts.
            ownSpeech = new AlarmSpeech(this);
            ownSpeech.start(AlarmSpeech.wordsFor(e, getString(R.string.alarm_title_fallback)), true,
                    AudioAttributes.USAGE_ALARM, new AlarmSpeech.Listener() {
                        @Override
                        public void finished(boolean spoke) {
                            if (!spoke && ownSpeech != null) {
                                ownSpeech = null;
                                startOwnTone(e);
                            }
                        }
                    });
        } else {
            startOwnTone(e);
        }
        startOwnVibration();
        handler.removeCallbacks(ownRingOut);
        handler.postDelayed(ownRingOut, RING_MS);
    }

    private void startOwnTone(AlarmStore.Entry e) {
        Uri uri = e != null ? AlarmSound.cachedUri(this, e.soundUrl) : null;
        if (uri == null) {
            uri = AlarmSound.readyUri(this);
        }
        if (uri == null) {
            uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        }
        try {
            ownPlayer = new MediaPlayer();
            ownPlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            ownPlayer.setDataSource(this, uri);
            ownPlayer.setLooping(true);
            ownPlayer.prepare();
            ownBoost = AlarmBoost.attach(ownPlayer.getAudioSessionId(), "alarm tone (screen)");
            ownPlayer.start();
        } catch (Exception ex) {
            Log.w(TAG, "AlarmActivity: could not play alarm sound", ex);
            stopOwnPlayer();
        }
    }

    private void startOwnVibration() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            ownVibrator = vm != null ? vm.getDefaultVibrator() : null;
        } else {
            ownVibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        }
        if (ownVibrator != null && ownVibrator.hasVibrator()) {
            long[] pattern = {0, 800, 400, 800, 400};
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ownVibrator.vibrate(VibrationEffect.createWaveform(pattern, 0),
                        new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
            } else {
                ownVibrator.vibrate(pattern, 0);
            }
        }
    }

    private void stopOwnPlayer() {
        if (ownSpeech != null) {
            ownSpeech.stop();
            ownSpeech = null;
        }
        AlarmBoost.release(ownBoost);
        ownBoost = null;
        if (ownPlayer != null) {
            try {
                if (ownPlayer.isPlaying()) {
                    ownPlayer.stop();
                }
            } catch (Exception ignored) {
            }
            ownPlayer.release();
            ownPlayer = null;
        }
    }

    private void stopOwnRinging() {
        handler.removeCallbacks(ownRingOut);
        stopOwnPlayer();
        if (ownVibrator != null) {
            ownVibrator.cancel();
            ownVibrator = null;
        }
    }

    private void showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) {
                km.requestDismissKeyguard(this, null);
            }
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void sendToService(String action, int minutes) {
        answered = true;
        Intent i = new Intent(this, AlarmService.class)
                .setAction(action)
                .putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarmId)
                .putExtra(AlarmService.EXTRA_MINUTES, minutes);
        startService(i);
    }

    /** Home, Back or the screen closing while it rang: the service decides (AlarmService.leftRinging). */
    private void tellServiceLeft(String how) {
        answered = true;
        try {
            startService(new Intent(this, AlarmService.class)
                    .setAction(AlarmService.ACTION_LEFT)
                    .putExtra(AlarmScheduler.EXTRA_ALARM_ID, alarmId)
                    .putExtra(AlarmService.EXTRA_HOW, how));
        } catch (Exception ex) {
            Log.w(TAG, "AlarmActivity: could not tell the service the screen was left", ex);
        }
    }

    /** Leaving while it rings stops it here, and the service hears how. */
    private void leaveRinging(String how) {
        stopOwnRinging();
        tellServiceLeft(how);
        finish();
    }

    private void snooze(int minutes) {
        stopOwnRinging();
        sendToService(AlarmService.ACTION_SNOOZE, minutes);
        finish();
    }

    /** Later: the ring stops and nothing is booked here; the app stays closed. */
    private void later() {
        stopOwnRinging();
        sendToService(AlarmService.ACTION_LATER, 0);
        finish();
    }

    private static JSONArray parseActions(AlarmStore.Entry e) {
        if (e == null || e.actionsJson == null || e.actionsJson.isEmpty()) {
            return null;
        }
        try {
            JSONArray arr = new JSONArray(e.actionsJson);
            return arr.length() > 0 ? arr : null;
        } catch (Exception ex) {
            return null;
        }
    }

    /** A custom action: counted as a dismissal, then the app opens at the path it asked for. */
    private void dismissTo(String path) {
        stopOwnRinging();
        sendToService(AlarmService.ACTION_DISMISS, 0);
        Intent open = new Intent(this, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(WidgetBridge.EXTRA_WIDGET_PATH, path);
        startActivity(open);
        finish();
    }

    static boolean canMarkDone(AlarmStore.Entry e, String taskId) {
        return taskId != null && !taskId.isEmpty() && e != null && !e.noSnooze && !e.event && parseActions(e) == null;
    }

    /**
     * Done: the ring stops for good (not counted as a dismissal) and the app opens
     * the task's page with done=1, which marks it done there — the same finish as
     * the page's own Done button, including the next copy of a repeating task.
     */
    private void markDone() {
        markDoneFor(taskId);
    }

    /** Done for one task (the alarm's own, or one ringing together with it); the others stay open. */
    private void markDoneFor(String doneTaskId) {
        stopOwnRinging();
        sendToService(AlarmService.ACTION_DONE, 0);
        Intent open = new Intent(this, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(WidgetBridge.EXTRA_WIDGET_PATH,
                        "/TaskNotification?taskId=" + Uri.encode(doneTaskId) + "&from=alarm&done=1");
        startActivity(open);
        finish();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // The ringing notification's Done button, while this screen is already up.
        // Act on the alarm the button belongs to, not whichever this screen shows.
        if (intent != null && intent.getBooleanExtra(EXTRA_MARK_DONE, false)) {
            String id = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID);
            AlarmStore.Entry e = AlarmStore.get(this, id != null ? id : alarmId);
            if (e != null && canMarkDone(e, e.taskId)) {
                alarmId = e.id;
                taskId = e.taskId;
                markDone();
            }
        }
    }

    /** An event's "Record notes" (or other second button): stop the ring and open its page. */
    private void openEventPage() {
        stopOwnRinging();
        sendToService(AlarmService.ACTION_DISMISS, 0);
        Intent open = new Intent(this, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(WidgetBridge.EXTRA_WIDGET_PATH, "/TaskNotification?taskId=" + Uri.encode(taskId) + "&from=alarm");
        startActivity(open);
        finish();
    }

    private void dismiss() {
        stopOwnRinging();
        sendToService(AlarmService.ACTION_DISMISS, 0);
        // An event's "Got it" only stops the ring: nothing to open, they're
        // on their way (or not) either way.
        AlarmStore.Entry e = alarmId != null ? AlarmStore.get(this, alarmId) : null;
        if (e != null && e.event) {
            finish();
            return;
        }
        // Straight to the task, the same way a widget row opens one.
        Intent open = new Intent(this, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (openList) {
            open.putExtra(WidgetBridge.EXTRA_WIDGET_PATH, "/Tasks");
        } else if (taskId != null && !taskId.isEmpty()) {
            // from=alarm: this dismissal is already counted here, so the task
            // page must not count it again when the user leaves it.
            open.putExtra(WidgetBridge.EXTRA_WIDGET_PATH, "/TaskNotification?taskId=" + Uri.encode(taskId) + "&from=alarm");
        } else if (screen != null && screen.startsWith("/")) {
            // No task: land where the push itself pointed (the commute push
            // opens Places), instead of the app's front door.
            open.putExtra(WidgetBridge.EXTRA_WIDGET_PATH, screen);
        }
        startActivity(open);
        finish();
    }

    @Override
    public void onBackPressed() {
        backStopsRing();
    }

    /**
     * Back while it rings closes the alarm, the same as Home (Anna, Oct 12
     * 2026: a stray Back or Home used to leave it ringing with nothing on
     * screen to stop it; now either one stops it and the task goes back to
     * Smart Reminders, or, for a time they set inside quiet hours, it rings
     * again in 10 minutes: AlarmService.leftRinging). Once nothing rings, Back
     * just closes the screen.
     */
    private void backStopsRing() {
        if (!answered && ringingHere()) {
            Log.d(TAG, "AlarmActivity: Back while ringing");
            leaveRinging("back");
            return;
        }
        finish();
    }

    /** This alarm is still ringing, from the service or from this screen itself. */
    private boolean ringingHere() {
        return (alarmId != null && AlarmService.isRinging(alarmId))
                || ownPlayer != null || ownSpeech != null || ownVibrator != null;
    }

    /**
     * Home or the recent-apps button while it rings (never called when this
     * screen opens the app itself: a button was used by then, so answered).
     */
    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (!answered && ringingHere()) {
            Log.d(TAG, "AlarmActivity: Home while ringing");
            leaveRinging("home");
        }
    }
}
