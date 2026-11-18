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
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

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
    /** When the first Back while ringing came (elapsedRealtime); 0 = none yet. */
    private long firstBackAt = 0L;
    /** A second Back within this long closes the alarm. */
    private static final long BACK_AGAIN_MS = 3_000L;
    /**
     * Taps don't count until this moment (elapsedRealtime; 0 = no wait). Set
     * when the screen opens over a phone that was in use: whatever they were
     * about to tap in the app underneath lands here instead, and a tap on the
     * round Done would finish the task (Anna, Nov 18 2026: "I keep on having
     * issues with alarms popping up and accidentally clicking out of it since
     * I am doing something on my phone"). The Later bar needs no wait: it has
     * to be held, which a stray tap can't do. Done on the banner is a tap they
     * meant, and doesn't wait either.
     */
    private long tapsCountFrom = 0L;
    private static final long TAP_WAIT_MS = 800L;

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
    // Whether the theme writes the Later button in capitals (read once, before
    // nameLater takes the capitals off so the task's name keeps its own case).
    private Boolean laterInCaps;
    // The alarm screen from build 49 on (a big round Done, a Later bar that has
    // to be held: activity_alarm_v2.xml). False = the screen every build before
    // it had. Decided once, in onCreate (AlarmLook).
    private boolean v2 = false;
    /** The new screen has been told to keep clear of the phone's own bars (keepClearOfBarsV2). */
    private boolean barsWatched = false;
    /** The new screen's round button: its side in pixels, and its colours. */
    private int roundPx = 0;
    private int roundFill = 0xFF8B5CF6;
    private int roundText = 0xFFFFFFFF;
    /** Whether this alarm gets the small line over its title (a task's does), room allowing. */
    private boolean kickerWanted = true;
    /** How often fitV2 has run for the screen as it is now (it settles in two or three). */
    private int fitPasses = 0;
    private int fitHeight = -1;
    /** Room was so short that the space around the words (and the glass card) was given to the words. */
    private boolean wordsBare = false;
    /** The line under the Later bar goes back to its own words after "keep holding". */
    private final Runnable hintBack = new Runnable() {
        @Override
        public void run() {
            TextView hint = findViewById(R.id.alarm_later_hint);
            if (hint != null) {
                hint.setText(R.string.alarm_later_hint);
                hint.setAlpha(0.82f);
            }
        }
    };
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
        showWordsAndDone(e);
        if (v2) {
            arrangeV2(e);
        }
    }

    private void showWordsAndDone(AlarmStore.Entry e) {
        String title = e != null && !e.title.isEmpty() ? e.title : getString(R.string.alarm_title_fallback);
        String heading = e != null && e.heading != null && !e.heading.isEmpty() ? e.heading : title;
        String body = AlarmService.withCompanions(e, e != null && e.body != null ? e.body : "");
        TextView headingView = findViewById(R.id.alarm_heading);
        TextView titleView = findViewById(R.id.alarm_task_title);
        headingView.setText(heading);
        if (v2) {
            // The new screen: the reminder's title large, its words under it
            // (the task's own name when the app sent a title and no words).
            String under = !body.isEmpty() ? body : (heading.equals(title) ? "" : title);
            titleView.setText(under);
            titleView.setVisibility(under.isEmpty() ? View.GONE : View.VISIBLE);
        } else {
            titleView.setText(body.isEmpty() ? title : body);
            if (!body.isEmpty()) {
                titleView.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 22);
            }
        }
        nameLater(e);
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
        if (v2) {
            companionsV2(e, done, others);
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
        b.setOnClickListener(tap(() -> markDoneFor(otherTask)));
        row.addView(done);
        row.addView(b);
        parent.addView(row, at);
    }

    /**
     * The task's name on the Later button itself (Anna, Nov 16 2026: "I keep
     * pressing later without even reading the alarm. Pure adhd."): the thing the
     * thumb goes for is the thing to read. One line under the word, cut with an
     * ellipsis when it is long. The button stays where it was and as big as it
     * was; with other tasks ringing together it says how many it puts off,
     * since Later gives all of them the same break.
     */
    private void nameLater(AlarmStore.Entry e) {
        try {
            Button later = findViewById(R.id.alarm_later);
            if (later == null || e == null) {
                return;
            }
            String name = e.title == null ? "" : e.title.trim();
            int others = e.companionTaskIds().size();
            if (others == 1) {
                name = "both tasks";
            } else if (others > 1) {
                name = "all " + (others + 1) + " tasks";
            }
            if (name.isEmpty()) {
                return;
            }
            if (v2) {
                // The new screen: the name goes on the bar people hold.
                HoldLaterView hold = findViewById(R.id.alarm_later_hold);
                if (hold != null) {
                    hold.setWords(getString(R.string.alarm_hold_later), name);
                }
                return;
            }
            if (laterInCaps == null) {
                laterInCaps = later.getTransformationMethod() != null;
            }
            String word = getString(R.string.alarm_action_later);
            if (laterInCaps) {
                word = word.toUpperCase(java.util.Locale.getDefault());
            }
            later.setAllCaps(false);
            android.text.SpannableString label = new android.text.SpannableString(word + "\n" + name);
            label.setSpan(new android.text.style.RelativeSizeSpan(0.72f), word.length() + 1, label.length(),
                    android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            later.setText(label);
            later.setMaxLines(2);
            later.setEllipsize(android.text.TextUtils.TruncateAt.END);
            // Two lines in the height one line had: no padding above and below,
            // and a very large system font is held back so the name isn't cut off.
            later.setIncludeFontPadding(false);
            later.setPadding(later.getPaddingLeft(), 0, later.getPaddingRight(), 0);
            float fontScale = getResources().getConfiguration().fontScale;
            if (fontScale > 1.3f) {
                later.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 18f * 1.3f / fontScale);
            }
        } catch (Exception ex) {
            Log.w(TAG, "AlarmActivity: Later not named", ex);
        }
    }

    /**
     * The words look a little different from one alarm to the next (Anna's yes,
     * Nov 16 2026). A screen that looks the same every time stops being read:
     * in a BYU study on Android phones (MIS Quarterly, 2018) people still heeded
     * warnings that changed their look 76% of the time after 15 days, against
     * 55% for ones that always looked the same. Four looks, taken in turn so no
     * two alarms in a row match: where the heading and the words sit, their
     * typeface, and how they come in. ONLY the heading and the words change;
     * the buttons never move, and the colours stay the theme's. If anything
     * here fails the words are simply shown as they always were.
     */
    private void varyLook() {
        if (v2) {
            varyLookV2();
            return;
        }
        final TextView heading = findViewById(R.id.alarm_heading);
        final TextView words = findViewById(R.id.alarm_task_title);
        if (heading == null || words == null) {
            return;
        }
        try {
            android.content.SharedPreferences p = getSharedPreferences("adhdone_alarm_look", MODE_PRIVATE);
            int look = Math.abs(p.getInt("next", 0)) % 4;
            p.edit().putInt("next", (look + 1) % 4).apply();
            float from = 28f * getResources().getDisplayMetrics().density;
            if (look == 1) {
                // From the left edge instead of centred.
                words.setGravity(android.view.Gravity.START);
                heading.setGravity(android.view.Gravity.START);
                android.view.ViewGroup.LayoutParams lp = heading.getLayoutParams();
                lp.width = android.view.ViewGroup.LayoutParams.MATCH_PARENT;
                heading.setLayoutParams(lp);
                words.setTranslationX(-from);
            } else if (look == 2) {
                words.setTypeface(android.graphics.Typeface.SERIF, android.graphics.Typeface.BOLD);
                words.setScaleX(0.92f);
                words.setScaleY(0.92f);
            } else if (look == 3) {
                // The heading under the words instead of over them.
                android.view.ViewGroup box = (android.view.ViewGroup) heading.getParent();
                if (box != null && box == words.getParent()
                        && heading.getLayoutParams() instanceof LinearLayout.LayoutParams
                        && words.getLayoutParams() instanceof LinearLayout.LayoutParams) {
                    LinearLayout.LayoutParams wordsAt = (LinearLayout.LayoutParams) words.getLayoutParams();
                    LinearLayout.LayoutParams headingAt = (LinearLayout.LayoutParams) heading.getLayoutParams();
                    int gap = wordsAt.topMargin;
                    box.removeView(heading);
                    wordsAt.topMargin = 0;
                    words.setLayoutParams(wordsAt);
                    headingAt.topMargin = gap;
                    box.addView(heading, box.indexOfChild(words) + 1, headingAt);
                }
                words.setTranslationY(-from);
            } else {
                words.setTranslationY(from);
            }
            words.setAlpha(0f);
            heading.setAlpha(0f);
            words.animate().alpha(1f).translationX(0f).translationY(0f).scaleX(1f).scaleY(1f).setDuration(320L).start();
            heading.animate().alpha(1f).setDuration(320L).start();
        } catch (Exception ex) {
            Log.w(TAG, "AlarmActivity: look not varied", ex);
        }
        // Whatever happened above, the words are fully on screen within a second.
        words.postDelayed(new Runnable() {
            @Override
            public void run() {
                try {
                    words.animate().cancel();
                    heading.animate().cancel();
                    words.setAlpha(1f);
                    heading.setAlpha(1f);
                    words.setTranslationX(0f);
                    words.setTranslationY(0f);
                    words.setScaleX(1f);
                    words.setScaleY(1f);
                } catch (Exception ignored) {
                }
            }
        }, 900L);
    }

    private static String shortTitle(String t) {
        String s = t == null ? "" : t.trim();
        return s.length() > 22 ? s.substring(0, 21) + "…" : s;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Read first, before this screen changes the lock screen or the display.
        tapsCountFrom = phoneInUse() ? SystemClock.elapsedRealtime() + TAP_WAIT_MS : 0L;
        showOverLockScreen();

        alarmId = getIntent().getStringExtra(AlarmScheduler.EXTRA_ALARM_ID);
        AlarmStore.Entry e = alarmId != null ? AlarmStore.get(this, alarmId) : null;
        taskId = e != null ? e.taskId : "";
        screen = e != null && e.screen != null ? e.screen : "";
        // The new screen (build 49 on), unless the server has switched it off
        // for this phone (AlarmLook). If anything about it fails here, the
        // screen every build before had is shown instead: an alarm never comes
        // up blank or without its buttons.
        v2 = AlarmLook.useNew(this);
        if (v2) {
            try {
                setContentView(R.layout.activity_alarm_v2);
                bind(e);
            } catch (Throwable t) {
                Log.w(TAG, "AlarmActivity: the new screen failed, showing the earlier one", t);
                v2 = false;
                openList = false;
                laterInCaps = null;
            }
        }
        if (!v2) {
            setContentView(R.layout.activity_alarm);
            bind(e);
        }
        showing = new WeakReference<>(this);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::backStopsRing);
        }
        if (getIntent().getBooleanExtra(EXTRA_MARK_DONE, false) && canMarkDone(e, taskId)) {
            markDone();
        }
    }

    /** Fills whichever layout is up (the new screen or the earlier one) for this alarm. */
    private void bind(AlarmStore.Entry e) {
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
        snooze10.setOnClickListener(tap(() -> snooze(10)));
        snooze30.setOnClickListener(tap(() -> snooze(30)));
        snooze60.setOnClickListener(tap(() -> snooze(60)));
        dismiss.setOnClickListener(tap(() -> dismiss()));
        // "Done": people finish the thing and forget to tick it off, then ignore
        // every reminder about it for the rest of the day. Only for a real task
        // (not a timer's end or a pushed moment with no task).
        if (canMarkDone(e, taskId)) {
            done.setOnClickListener(tap(() -> markDone()));
            // "Later": stop without picking a time; the task goes back to its
            // normal reminders (smart nudges decide when, for what they handle).
            later.setOnClickListener(tap(() -> later()));
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
                done.setOnClickListener(tap(() -> openEventPage()));
                done.setVisibility(android.view.View.VISIBLE);
            }
        }
        if (e != null && e.eased && canMarkDone(e, taskId)) {
            // The eased plan's one alarm a day: only Done and Later (Anna, Oct
            // 22 2026: "these alarms that are happening after multiple
            // dismissals should just have a done and later button").
            snooze10.setVisibility(android.view.View.GONE);
            snooze30.setVisibility(android.view.View.GONE);
            snooze60.setVisibility(android.view.View.GONE);
            findViewById(R.id.alarm_snooze_label).setVisibility(android.view.View.GONE);
            dismiss.setVisibility(android.view.View.GONE);
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
                slots[i].setOnClickListener(tap(() -> dismissTo(path)));
            }
        }

        if (v2 && actions == null) {
            // The new screen gives a task two choices, Done and Later, and no
            // Snooze (Anna, Nov 16 2026: "Only keep done and later. Like the
            // first freaking design i approved."). The three slots stay in the
            // layout for the app's own choices just above (a sprint's).
            snooze10.setVisibility(android.view.View.GONE);
            snooze30.setVisibility(android.view.View.GONE);
            snooze60.setVisibility(android.view.View.GONE);
            findViewById(R.id.alarm_snooze_label).setVisibility(android.view.View.GONE);
        }
        // Same colours as the app is currently themed with (see AlarmTheme).
        try {
            if (v2) {
                // The small line over the title takes the theme's quiet colour,
                // the title its text colour, and the words under it follow.
                TextView big = findViewById(R.id.alarm_heading);
                AlarmTheme.apply(this, findViewById(R.id.alarm_root),
                        findViewById(R.id.alarm_bg_image), findViewById(R.id.alarm_bg_scrim),
                        findViewById(R.id.alarm_kicker), big,
                        findViewById(R.id.alarm_snooze_label),
                        new Button[] { snooze10, snooze30, snooze60 }, dismiss);
                titleView.setTextColor(big.getCurrentTextColor());
            } else {
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
            }
        } catch (Exception ex) {
            Log.w(TAG, "AlarmActivity: theme not applied", ex);
        }
        if (v2) {
            styleV2();
        }
        showWords(e);
        varyLook();
    }

    // ── The alarm screen from build 49 on ───────────────────────────────────
    //
    // Anna, Nov 16 2026: "I keep pressing later without even reading the alarm.
    // Pure adhd.", then, of the designs she was sent, "I like the big done, but
    // also the later is maybe too small" and "Your design is good too". One big
    // round Done to tap; a wide Later bar that has to be held, with the task's
    // name on it. Two choices and no Snooze: "Only keep done and later. Like
    // the first freaking design i approved." Everything below only runs on the
    // new layout.

    /**
     * The new screen's own pieces in the theme's colours: the round button,
     * the Later bar, the clock and the line under the bar. On a dark look the
     * round button is the theme's accent; on a light one it is the text colour
     * with white on it. A plain dark background gets two soft glows.
     */
    private void styleV2() {
        android.util.DisplayMetrics dm = getResources().getDisplayMetrics();
        boolean dark = AlarmTheme.isDark(this);
        keepClearOfBarsV2(dark);
        TextView big = findViewById(R.id.alarm_heading);
        int text = big.getCurrentTextColor();
        int accent = AlarmTheme.accent(this, getColor(R.color.alarm_dismiss));
        roundFill = dark ? accent : text;
        roundText = dark ? AlarmTheme.onAccent(this, android.graphics.Color.WHITE) : android.graphics.Color.WHITE;
        // A third of the screen's height, within sensible limits: big on a
        // tall phone, and still leaving room for the words on a short one.
        float sideDp = Math.max(168f, Math.min(264f, dm.heightPixels / dm.density * 0.33f));
        roundPx = Math.round(sideDp * dm.density);
        Button done = findViewById(R.id.alarm_done);
        styleRound(done, roundPx);
        fitRound(done, roundPx, false);
        HoldLaterView hold = findViewById(R.id.alarm_later_hold);
        hold.setColors(dark ? 0x21FFFFFF : 0xEBFFF6EE, dark ? 0x57FFFFFF : 0x242B2730,
                dark ? 0x8CE879AA : 0xFFF4A9B8, text);
        hold.setWords(getString(R.string.alarm_hold_later), "");
        hold.setListener(new HoldLaterView.Listener() {
            @Override
            public void onHeld() {
                later();
            }

            @Override
            public void onTapped() {
                sayKeepHolding();
            }
        });
        ((TextView) findViewById(R.id.alarm_later_hint)).setTextColor(text);
        ((TextView) findViewById(R.id.alarm_clock)).setTextColor(text);
        // The three slots over the Later bar (only ever the app's own choices
        // for a moment like a sprint: Snooze is not offered on this screen) are
        // quiet rounded chips, and the third button a rounded bar in the
        // theme's accent: neither competes with the round button.
        for (int id : new int[] { R.id.alarm_snooze_10, R.id.alarm_snooze_30, R.id.alarm_snooze_60 }) {
            Button chip = findViewById(id);
            chip.setBackgroundTintList(null);
            chip.setBackground(rounded(dark ? 0x24FFFFFF : 0x80FFFFFF, 16f * dm.density));
            chip.setTextColor(text);
            chip.setStateListAnimator(null);
            chip.setElevation(0f);
        }
        Button third = findViewById(R.id.alarm_dismiss);
        third.setBackgroundTintList(null);
        third.setBackground(rounded(accent, 20f * dm.density));
        third.setStateListAnimator(null);
        third.setElevation(0f);
        // A very large system font is held back on the words (as it always was
        // on the Later button), so they still share the screen with the buttons.
        TextView under = findViewById(R.id.alarm_task_title);
        under.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, 17f * dm.density * fontCap());
        ((TextView) findViewById(R.id.alarm_kicker)).setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX,
                13f * dm.density * fontCap());
        // Sizes are settled right before the first frame is drawn, and again
        // whenever the screen's height or what the alarm offers changes.
        final View content = findViewById(R.id.alarm_content);
        content.getViewTreeObserver().addOnPreDrawListener(new android.view.ViewTreeObserver.OnPreDrawListener() {
            @Override
            public boolean onPreDraw() {
                int h = ((View) content.getParent()).getHeight();
                if (h != fitHeight) {
                    fitHeight = h;
                    fitPasses = 0;
                }
                if (fitPasses >= 5) {
                    return true;
                }
                fitPasses++;
                try {
                    if (fitV2()) {
                        return false;
                    }
                } catch (Exception ex) {
                    Log.w(TAG, "AlarmActivity: the new screen was not fitted", ex);
                    fitPasses = 5;
                }
                return true;
            }
        });
        View glow = findViewById(R.id.alarm_glow);
        if (glow != null && AlarmTheme.plainDark(this)) {
            float reach = (float) Math.hypot(dm.widthPixels, dm.heightPixels) * 0.5f;
            int top = android.graphics.Color.rgb(android.graphics.Color.red(accent) * 55 / 100,
                    android.graphics.Color.green(accent) * 55 / 100, android.graphics.Color.blue(accent) * 55 / 100);
            android.graphics.drawable.GradientDrawable a = new android.graphics.drawable.GradientDrawable();
            a.setGradientType(android.graphics.drawable.GradientDrawable.RADIAL_GRADIENT);
            a.setGradientRadius(reach);
            a.setGradientCenter(0.28f, 0.12f);
            a.setColors(new int[] { (top & 0x00FFFFFF) | 0xE6000000, top & 0x00FFFFFF });
            android.graphics.drawable.GradientDrawable b = new android.graphics.drawable.GradientDrawable();
            b.setGradientType(android.graphics.drawable.GradientDrawable.RADIAL_GRADIENT);
            b.setGradientRadius(reach * 0.9f);
            b.setGradientCenter(0.92f, 0.92f);
            b.setColors(new int[] { 0xD96E3358, 0x006E3358 });
            glow.setBackground(new android.graphics.drawable.LayerDrawable(
                    new android.graphics.drawable.Drawable[] { a, b }));
            glow.setVisibility(View.VISIBLE);
        }
    }

    /** A rounded bar in one colour, with the usual press ripple. */
    private static android.graphics.drawable.Drawable rounded(int color, float radius) {
        android.graphics.drawable.GradientDrawable face = new android.graphics.drawable.GradientDrawable();
        face.setCornerRadius(radius);
        face.setColor(color);
        android.graphics.drawable.GradientDrawable mask = new android.graphics.drawable.GradientDrawable();
        mask.setCornerRadius(radius);
        mask.setColor(android.graphics.Color.WHITE);
        return new android.graphics.drawable.RippleDrawable(
                android.content.res.ColorStateList.valueOf(0x33FFFFFF), face, mask);
    }

    /** The system's font size, held to one and a half times: what the new screen's words follow. */
    private float fontCap() {
        return Math.max(0.85f, Math.min(getResources().getConfiguration().fontScale, 1.5f));
    }

    private static int spare(android.text.TextPaint p) {
        android.graphics.Paint.FontMetricsInt m = p.getFontMetricsInt();
        return Math.max(0, m.ascent - m.top) + Math.max(0, m.bottom - m.descent);
    }

    private static int linesOf(CharSequence t, android.text.TextPaint paint, int width) {
        if (t == null || t.length() == 0 || width <= 0) {
            return 0;
        }
        return android.text.StaticLayout.Builder.obtain(t, 0, t.length(), paint, width).build().getLineCount();
    }

    /**
     * Fits the new screen to this phone. Every button stays on the screen; the
     * round button is as big as the room allows (a third of the screen's
     * height at most); the words take the rest and are cut to the lines that
     * fit, the small line over the title going first when room is short.
     * Long words make the round button a little smaller before they are cut.
     * Returns true when it changed a size: the frame is then laid out again.
     */
    private boolean fitV2() {
        LinearLayout content = findViewById(R.id.alarm_content);
        View area = findViewById(R.id.alarm_words_area);
        View words = findViewById(R.id.alarm_words);
        LinearLayout row = findViewById(R.id.alarm_done_row);
        TextView kicker = findViewById(R.id.alarm_kicker);
        TextView big = findViewById(R.id.alarm_heading);
        TextView under = findViewById(R.id.alarm_task_title);
        Button done = findViewById(R.id.alarm_done);
        View frame = (View) content.getParent();
        android.util.DisplayMetrics dm = getResources().getDisplayMetrics();
        float d = dm.density;
        int width = words.getWidth() - words.getPaddingLeft() - words.getPaddingRight();
        int space = frame.getHeight() - content.getPaddingTop() - content.getPaddingBottom();
        if (space <= 0 || width <= 0) {
            return false;
        }
        // A short window (a phone lying on its side, a split screen, a very
        // small phone): there was no room left for the title, and it was cut
        // through its letters. The screen's own clock steps aside there (the
        // phone shows the time itself) and the round button may be smaller,
        // so the title and both buttons are whole.
        boolean tight = frame.getHeight() < Math.round(440f * d);
        View clock = findViewById(R.id.alarm_clock);
        if (clock != null && (clock.getVisibility() == View.GONE) != tight) {
            clock.setVisibility(tight ? View.GONE : View.VISIBLE);
            return true;
        }
        // Everything but the words and the round button takes what it takes.
        for (int i = 0; i < content.getChildCount(); i++) {
            View v = content.getChildAt(i);
            if (v == area || v == row || v.getVisibility() == View.GONE) {
                continue;
            }
            android.view.ViewGroup.MarginLayoutParams lp = (android.view.ViewGroup.MarginLayoutParams) v.getLayoutParams();
            space -= v.getHeight() + lp.topMargin + lp.bottomMargin;
        }
        // An alarm with the app's own choices has no round button (arrangeV2).
        boolean noRound = done.getVisibility() != View.VISIBLE;
        int maxRound = noRound ? 0 : Math.round(Math.max(168f, Math.min(264f, dm.heightPixels / d * 0.33f)) * d);
        int minRound = noRound ? 0 : Math.round((tight ? 96f : 132f) * d);
        int comfort = Math.max(minRound, Math.round(maxRound * 0.76f));
        int pads = area.getPaddingTop() + area.getPaddingBottom() + words.getPaddingTop() + words.getPaddingBottom();
        // The gap over the title belongs to the small line over it (10dp, as
        // in the layout): it is only kept while that line shows (see the end).
        int gapBig = Math.round(10f * d);
        int gapUnder = ((android.view.ViewGroup.MarginLayoutParams) under.getLayoutParams()).topMargin;
        CharSequence underText = under.getText();
        // Each block of text also takes the font's spare room above its first
        // line and below its last (spare), or its last line gets cut.
        int kickerH = kicker.getLineHeight() + gapBig + spare(kicker.getPaint());
        int underLH = under.getLineHeight();
        int underSpare = spare(under.getPaint());
        int underN = linesOf(underText, under.getPaint(), width);
        // The title at its own size, then a little smaller if it would be cut.
        float[] sizes = { 30f * d * fontCap(), 25f * d * fontCap() };
        float size = sizes[0];
        int t = 1;
        int u = 0;
        boolean k = false;
        int round = minRound;
        int wordsH = 0;
        int wanted = 0;
        for (int i = 0; i < sizes.length; i++) {
            android.text.TextPaint paint = new android.text.TextPaint(big.getPaint());
            paint.setTextSize(sizes[i]);
            int bigLH = paint.getFontMetricsInt(null);
            int bigSpare = spare(paint);
            int bigN = Math.max(1, linesOf(big.getText(), paint, width));
            int want = pads + (kickerWanted ? kickerH : 0) + Math.min(bigN, 3) * bigLH + bigSpare
                    + (underN > 0 ? gapUnder + underSpare + Math.min(underN, 4) * underLH : 0);
            int h = Math.max(pads + 2 * bigLH + bigSpare, Math.min(want, space - comfort));
            int r = Math.max(minRound, Math.min(maxRound, space - h));
            h = Math.max(space - r, Math.round(40f * d));
            int room = h - pads;
            boolean kk = kickerWanted;
            int tt = Math.min(bigN, 4);
            int uu = Math.min(underN, 6);
            while ((kk ? kickerH : 0) + tt * bigLH + bigSpare + (uu > 0 ? gapUnder + underSpare + uu * underLH : 0) > room) {
                if (uu > 3) {
                    uu--;
                } else if (tt > 2) {
                    tt--;
                } else if (uu > 2) {
                    uu--;
                } else if (kk) {
                    kk = false;
                } else if (uu > 0) {
                    uu--;
                } else if (tt > 1) {
                    tt--;
                } else {
                    break;
                }
            }
            size = sizes[i];
            t = tt;
            u = uu;
            k = kk;
            round = r;
            wordsH = h;
            // What the lines that will actually show take, with the space around them.
            wanted = pads + (kk ? kickerH : 0) + tt * bigLH + bigSpare + (uu > 0 ? gapUnder + underSpare + uu * underLH : 0);
            if (tt >= Math.min(bigN, 4) && (underN == 0 || uu >= 1)) {
                break;
            }
            if (i == sizes.length - 1 && !wordsBare && (tt < Math.min(bigN, 2) || (underN > 0 && uu == 0)
                    || tt * bigLH + bigSpare > room)) {
                // Not even two lines of title and a line of words (a small
                // phone with every button showing): the space around the
                // words, and the glass card if this alarm drew it, go to the
                // words themselves. Fitted again on the next pass.
                wordsBare = true;
                int sliver = Math.round(3f * d);
                area.setPadding(0, sliver, 0, sliver);
                words.setBackground(null);
                words.setPadding(0, 0, 0, 0);
                return true;
            }
        }
        boolean changed = false;
        // Two tasks ringing together share the row: one round button each.
        View second = row.findViewWithTag("done-second");
        boolean shared = second instanceof Button && second.getVisibility() == View.VISIBLE;
        int side = round;
        if (shared) {
            int gap = Math.round(14f * d);
            side = Math.max(Math.round(112f * d), Math.min(Math.round(round * 0.86f), (content.getWidth()
                    - content.getPaddingLeft() - content.getPaddingRight() - gap) / 2));
            wordsH += round - side;
        }
        // With Later under it, the round button sits near the middle of the
        // screen with air between it and the Later bar (as in the picture Anna
        // approved), not pressed against the bar: half of whatever room the
        // words don't need goes under it.
        View holdBar = findViewById(R.id.alarm_later_hold);
        int air = 0;
        if (holdBar != null && holdBar.getVisibility() == View.VISIBLE) {
            air = Math.max(0, Math.min((wordsH - wanted) / 2, Math.round(side * 0.32f)));
        }
        wordsH -= air;
        LinearLayout.LayoutParams rowAt = (LinearLayout.LayoutParams) row.getLayoutParams();
        if (rowAt.bottomMargin != air) {
            rowAt.bottomMargin = air;
            row.setLayoutParams(rowAt);
            changed = true;
        }
        if (!noRound && done.getLayoutParams().width != side) {
            roundPx = round;
            styleRound(done, side);
            fitRound(done, side, shared);
            if (shared) {
                styleRound((Button) second, side);
                fitRound((Button) second, side, true);
            }
            changed = true;
        }
        LinearLayout.LayoutParams alp = (LinearLayout.LayoutParams) area.getLayoutParams();
        if (alp.height != wordsH || alp.weight != 0f) {
            alp.height = wordsH;
            alp.weight = 0f;
            area.setLayoutParams(alp);
            changed = true;
        }
        if (Math.abs(big.getTextSize() - size) > 0.5f) {
            big.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, size);
            changed = true;
        }
        if (big.getMaxLines() != t) {
            big.setMaxLines(t);
            changed = true;
        }
        if (u > 0 && under.getMaxLines() != u) {
            under.setMaxLines(u);
            changed = true;
        }
        int underShown = u > 0 ? View.VISIBLE : View.GONE;
        if (under.getVisibility() != underShown) {
            under.setVisibility(underShown);
            changed = true;
        }
        int kickerShown = k ? View.VISIBLE : View.GONE;
        if (kicker.getVisibility() != kickerShown) {
            kicker.setVisibility(kickerShown);
            changed = true;
        }
        // Without the small line, the title's gap over it goes too. It used to
        // stay and was not counted, so on a tight screen the words were pushed
        // 10dp past their room and their last line was cut along its bottom.
        LinearLayout.LayoutParams bigAt = (LinearLayout.LayoutParams) big.getLayoutParams();
        int over = k ? gapBig : 0;
        if (bigAt.topMargin != over) {
            bigAt.topMargin = over;
            big.setLayoutParams(bigAt);
            changed = true;
        }
        return changed;
    }

    /** A round button: a solid circle with two soft rings around it, all in one colour. */
    private void styleRound(Button b, int sidePx) {
        android.view.ViewGroup.LayoutParams lp = b.getLayoutParams();
        lp.width = sidePx;
        lp.height = sidePx;
        b.setLayoutParams(lp);
        int rgb = roundFill & 0x00FFFFFF;
        android.graphics.drawable.GradientDrawable outer = new android.graphics.drawable.GradientDrawable();
        outer.setShape(android.graphics.drawable.GradientDrawable.OVAL);
        outer.setColor(rgb | 0x1A000000);
        android.graphics.drawable.GradientDrawable mid = new android.graphics.drawable.GradientDrawable();
        mid.setShape(android.graphics.drawable.GradientDrawable.OVAL);
        mid.setColor(rgb | 0x38000000);
        android.graphics.drawable.GradientDrawable inner = new android.graphics.drawable.GradientDrawable();
        inner.setShape(android.graphics.drawable.GradientDrawable.OVAL);
        inner.setColor(rgb | 0xFF000000);
        android.graphics.drawable.LayerDrawable face = new android.graphics.drawable.LayerDrawable(
                new android.graphics.drawable.Drawable[] { outer, mid, inner });
        int midIn = Math.round(sidePx * 0.058f);
        int innerIn = Math.round(sidePx * 0.109f);
        face.setLayerInset(1, midIn, midIn, midIn, midIn);
        face.setLayerInset(2, innerIn, innerIn, innerIn, innerIn);
        android.graphics.drawable.GradientDrawable mask = new android.graphics.drawable.GradientDrawable();
        mask.setShape(android.graphics.drawable.GradientDrawable.OVAL);
        mask.setColor(android.graphics.Color.WHITE);
        b.setBackgroundTintList(null);
        b.setBackground(new android.graphics.drawable.RippleDrawable(
                android.content.res.ColorStateList.valueOf(0x33FFFFFF), face, mask));
        b.setTextColor(roundText);
        b.setAllCaps(false);
        b.setStateListAnimator(null);
        b.setElevation(0f);
        b.setMinWidth(0);
        b.setMinHeight(0);
        b.setMinimumWidth(0);
        b.setMinimumHeight(0);
        int pad = Math.round(sidePx * 0.17f);
        b.setPadding(pad, pad, pad, pad);
        b.setGravity(android.view.Gravity.CENTER);
        b.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
    }

    /**
     * The round button's words sized to its circle (never to the system font:
     * the circle doesn't grow with it). A task's name on a shared alarm's two
     * buttons is smaller and may take three lines.
     */
    private void fitRound(Button b, int sidePx, boolean taskName) {
        CharSequence t = b.getText();
        int n = t == null ? 0 : t.length();
        float part = taskName ? 0.098f : n <= 7 ? 0.150f : n <= 13 ? 0.112f : 0.092f;
        b.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, sidePx * part);
        b.setMaxLines(taskName ? 3 : 2);
        b.setEllipsize(android.text.TextUtils.TruncateAt.END);
    }

    /**
     * Which button is the round one, and whether the third one shows. Runs
     * after the shared code has decided what this alarm offers, and again when
     * another task joins a ringing alarm.
     */
    private void arrangeV2(AlarmStore.Entry e) {
        Button done = findViewById(R.id.alarm_done);
        Button open = findViewById(R.id.alarm_dismiss);
        View hold = findViewById(R.id.alarm_later_hold);
        View hint = findViewById(R.id.alarm_later_hint);
        View kicker = findViewById(R.id.alarm_kicker);
        LinearLayout row = findViewById(R.id.alarm_done_row);
        View second = row != null ? row.findViewWithTag("done-second") : null;
        boolean shared = second != null && second.getVisibility() == View.VISIBLE;
        boolean task = canMarkDone(e, taskId);
        if (e != null && e.event) {
            // An event: "Got it" is the round button. A second thing to do
            // ("Record notes", "Add prep notes") is the button under it.
            boolean more = e.openLabel != null && !e.openLabel.isEmpty() && taskId != null && !taskId.isEmpty();
            done.setText(R.string.alarm_action_dismiss_plain);
            done.setOnClickListener(tap(() -> dismiss()));
            done.setVisibility(View.VISIBLE);
            fitRound(done, roundPx, false);
            if (more) {
                open.setText(e.openLabel);
                open.setOnClickListener(tap(() -> openEventPage()));
            }
            open.setVisibility(more ? View.VISIBLE : View.GONE);
        } else if (!task || openList) {
            // No Done on this alarm (a timer's end, a moment with no task, the
            // app's own choices, three tasks at once): its one way out takes
            // the round button, with the words the earlier screen gave it.
            done.setText(open.getText());
            done.setOnClickListener(tap(() -> dismiss()));
            done.setVisibility(View.VISIBLE);
            fitRound(done, roundPx, false);
            open.setVisibility(View.GONE);
        } else {
            // A task: Done is the round button. The third button only shows
            // when the app gave it its own words, which it does when the task
            // has something to do in the app (a text to send, say). The eased
            // plan's alarm stays Done and Later only.
            boolean needsApp = e != null && !e.eased && e.openLabel != null && !e.openLabel.isEmpty();
            open.setVisibility(needsApp ? View.VISIBLE : View.GONE);
            if (!shared) {
                fitRound(done, roundPx, false);
            }
        }
        if (parseActions(e) != null) {
            // The app's own choices for this moment (the task timer's end:
            // "Keep going", "I finished the task", "Stop working") are the
            // answer here, so they are what the screen shows: one under the
            // other, full width, the first in the theme's accent. No round
            // button; the plain way out (the earlier screen's big button,
            // with its words) is the quiet bar under them.
            float d = getResources().getDisplayMetrics().density;
            boolean dark = AlarmTheme.isDark(this);
            int text = ((TextView) findViewById(R.id.alarm_heading)).getCurrentTextColor();
            int quiet = dark ? 0x24FFFFFF : 0x80FFFFFF;
            done.setVisibility(View.GONE);
            open.setVisibility(View.VISIBLE);
            // The way out is an outline only, so it does not read as one more
            // answer under the app's choices ("Yes", "No", "Got it").
            android.graphics.drawable.GradientDrawable outline = new android.graphics.drawable.GradientDrawable();
            outline.setColor(android.graphics.Color.TRANSPARENT);
            outline.setCornerRadius(20f * d);
            outline.setStroke(Math.max(1, Math.round(1.5f * d)), (text & 0x00FFFFFF) | 0x59000000);
            open.setBackground(outline);
            open.setTextColor((text & 0x00FFFFFF) | 0xD9000000);
            LinearLayout choices = findViewById(R.id.alarm_snooze_row);
            choices.setOrientation(LinearLayout.VERTICAL);
            boolean first = true;
            for (int id : new int[] { R.id.alarm_snooze_10, R.id.alarm_snooze_30, R.id.alarm_snooze_60 }) {
                Button choice = findViewById(id);
                if (choice.getVisibility() != View.VISIBLE) {
                    continue;
                }
                LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) choice.getLayoutParams();
                lp.width = android.view.ViewGroup.LayoutParams.MATCH_PARENT;
                lp.height = Math.round(54f * d);
                lp.weight = 0f;
                lp.setMarginEnd(0);
                lp.topMargin = first ? 0 : Math.round(10f * d);
                choice.setLayoutParams(lp);
                choice.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 17f);
                choice.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
                choice.setMaxLines(1);
                choice.setEllipsize(android.text.TextUtils.TruncateAt.END);
                if (first) {
                    choice.setBackground(rounded(AlarmTheme.accent(this, getColor(R.color.alarm_dismiss)), 20f * d));
                    choice.setTextColor(AlarmTheme.onAccent(this, android.graphics.Color.WHITE));
                } else {
                    choice.setBackground(rounded(quiet, 20f * d));
                    choice.setTextColor(text);
                }
                first = false;
            }
        }
        // Later is offered exactly where the earlier screen offers it.
        hold.setVisibility(task ? View.VISIBLE : View.GONE);
        hint.setVisibility(task ? View.VISIBLE : View.GONE);
        kickerWanted = task;
        kicker.setVisibility(task ? View.VISIBLE : View.GONE);
        // What is offered may have changed: the sizes are settled again (fitV2).
        fitPasses = 0;
        View content = findViewById(R.id.alarm_content);
        if (content != null) {
            content.requestLayout();
        }
    }

    /**
     * Ringing together with other tasks, on the new screen. One other task:
     * two round buttons side by side, one per task, each finishing only its
     * own (Anna, Oct 10 2026: being reminded together doesn't mean finishing
     * together). Two or more others: no row of small circles; "Open the app"
     * takes the round button and goes to their task list.
     */
    private void companionsV2(AlarmStore.Entry e, Button done, java.util.List<String> others) {
        LinearLayout row = findViewById(R.id.alarm_done_row);
        Button open = findViewById(R.id.alarm_dismiss);
        View old = row != null ? row.findViewWithTag("done-second") : null;
        if (others.size() >= 2 || row == null) {
            if (old != null) {
                old.setVisibility(View.GONE);
            }
            done.setVisibility(View.GONE);
            if (open != null) {
                open.setText("Open the app");
            }
            openList = true;
            return;
        }
        final String otherTask = others.get(0);
        String otherTitle = e.companionTitles().isEmpty() ? "" : e.companionTitles().get(0);
        android.util.DisplayMetrics dm = getResources().getDisplayMetrics();
        int gap = Math.round(14 * dm.density);
        int room = dm.widthPixels - Math.round(44 * dm.density) - gap;
        int each = Math.max(Math.round(112 * dm.density), Math.min(Math.round(roundPx * 0.86f), room / 2));
        done.setText("✓ " + shortTitle(e.title));
        styleRound(done, each);
        fitRound(done, each, true);
        Button b = old instanceof Button ? (Button) old : null;
        if (b == null) {
            b = new Button(this);
            b.setTag("done-second");
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(each, each);
            lp.setMarginStart(gap);
            row.addView(b, lp);
        }
        b.setOnClickListener(tap(() -> markDoneFor(otherTask)));
        b.setText("✓ " + shortTitle(otherTitle));
        styleRound(b, each);
        fitRound(b, each, true);
        b.setVisibility(View.VISIBLE);
    }

    /** A quick tap on the Later bar: the line under it says what to do, for a moment. */
    private void sayKeepHolding() {
        TextView hint = findViewById(R.id.alarm_later_hint);
        if (hint == null) {
            return;
        }
        hint.setText(R.string.alarm_hold_more);
        hint.setAlpha(1f);
        handler.removeCallbacks(hintBack);
        handler.postDelayed(hintBack, 2200L);
    }

    /**
     * The new screen's four looks for the words, taken in turn like the earlier
     * screen's (see varyLook for why a screen that always looks the same stops
     * being read): centred, from the left edge, on a glass card, and in a
     * serif face. Only the words change; the buttons never move.
     */
    private void varyLookV2() {
        final View words = findViewById(R.id.alarm_words);
        final TextView kicker = findViewById(R.id.alarm_kicker);
        final TextView big = findViewById(R.id.alarm_heading);
        final TextView under = findViewById(R.id.alarm_task_title);
        if (words == null || kicker == null || big == null || under == null) {
            return;
        }
        try {
            android.content.SharedPreferences p = getSharedPreferences("adhdone_alarm_look", MODE_PRIVATE);
            int look = Math.abs(p.getInt("next", 0)) % 4;
            p.edit().putInt("next", (look + 1) % 4).apply();
            float d = getResources().getDisplayMetrics().density;
            float from = 28f * d;
            if (look == 1 || look == 2) {
                kicker.setGravity(android.view.Gravity.START);
                big.setGravity(android.view.Gravity.START);
                under.setGravity(android.view.Gravity.START);
            }
            if (look == 1) {
                words.setTranslationX(-from);
            } else if (look == 2) {
                boolean dark = AlarmTheme.isDark(this);
                android.graphics.drawable.GradientDrawable card = new android.graphics.drawable.GradientDrawable();
                card.setCornerRadius(26f * d);
                card.setColor(dark ? 0x17FFFFFF : 0x66FFFFFF);
                card.setStroke(Math.max(1, Math.round(d)), dark ? 0x29FFFFFF : 0x1A000000);
                words.setBackground(card);
                int side = Math.round(22f * d);
                int ends = Math.round(24f * d);
                words.setPadding(side, ends, side, ends);
                words.setScaleX(0.96f);
                words.setScaleY(0.96f);
            } else if (look == 3) {
                big.setTypeface(android.graphics.Typeface.SERIF, android.graphics.Typeface.BOLD);
                words.setTranslationY(-from);
            } else {
                words.setTranslationY(from);
            }
            words.setAlpha(0f);
            words.animate().alpha(1f).translationX(0f).translationY(0f).scaleX(1f).scaleY(1f).setDuration(320L).start();
        } catch (Exception ex) {
            Log.w(TAG, "AlarmActivity: look not varied", ex);
        }
        // Whatever happened above, the words are fully on screen within a second.
        words.postDelayed(new Runnable() {
            @Override
            public void run() {
                try {
                    words.animate().cancel();
                    words.setAlpha(1f);
                    words.setTranslationX(0f);
                    words.setTranslationY(0f);
                    words.setScaleX(1f);
                    words.setScaleY(1f);
                } catch (Exception ignored) {
                }
            }
        }, 900L);
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
        handler.removeCallbacks(hintBack);
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
        // A voice still finishing the last alarm's sentence stops for this one.
        AlarmSpeech.silenceLingering();
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

    /** Unlocked with the screen on: someone is most likely touching it right now. */
    private boolean phoneInUse() {
        try {
            android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            return pm != null && pm.isInteractive() && (km == null || !km.isKeyguardLocked());
        } catch (Exception ex) {
            return false;
        }
    }

    /** A button's tap. Not counted in the screen's first moments over a phone in use (tapsCountFrom). */
    private View.OnClickListener tap(final Runnable what) {
        return v -> {
            if (SystemClock.elapsedRealtime() < tapsCountFrom) {
                Log.d(TAG, "AlarmActivity: a tap in the first moments over a phone in use, not counted");
                return;
            }
            what.run();
        };
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
        // Ringing on this screen with the spoken alarm: the voice gets to the end
        // of the reminder once (AlarmSpeech.finishOnce), everything else stops.
        if (ownSpeech != null && ownSpeech.finishOnce()) {
            ownSpeech = null;
        }
        stopOwnRinging();
        sendToService(AlarmService.ACTION_LATER, 0);
        finish();
    }

    /**
     * Android 15 and up draw every app UNDER the status bar and the navigation
     * bar (forced for an app that targets Android 15 or later, as this one
     * does), and nothing here kept out of them: the screen's clock sat under
     * the phone's own clock and the line under the Later bar under the
     * navigation buttons (found Nov 16 2026 before build 49 went out, by
     * drawing the screen with the bars on it). The background still fills the
     * whole screen; the words and buttons keep clear of both bars and of a
     * camera cut-out. On older Android the system keeps the app out of the
     * bars itself and reports none, so nothing moves there.
     *
     * On a light theme the phone's own clock and icons are also asked for in
     * dark, so they can be read on it (they are white otherwise). Only where
     * the bars are see-through, Android 15 and up.
     */
    private void keepClearOfBarsV2(boolean dark) {
        final View content = findViewById(R.id.alarm_content);
        if (content == null || barsWatched) {
            return;
        }
        barsWatched = true;
        final float d = getResources().getDisplayMetrics().density;
        final int left = content.getPaddingLeft();
        final int top = content.getPaddingTop();
        final int right = content.getPaddingRight();
        final int bottom = content.getPaddingBottom();
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            androidx.core.graphics.Insets bars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars()
                    | androidx.core.view.WindowInsetsCompat.Type.displayCutout());
            int l = left + bars.left;
            int t = Math.max(top, bars.top + Math.round(10f * d));
            int r = right + bars.right;
            int b = Math.max(bottom, bars.bottom + Math.round(12f * d));
            if (v.getPaddingLeft() != l || v.getPaddingTop() != t || v.getPaddingRight() != r || v.getPaddingBottom() != b) {
                v.setPadding(l, t, r, b);
                // The room for the words and the round button changed (fitV2).
                fitPasses = 0;
            }
            return insets;
        });
        androidx.core.view.ViewCompat.requestApplyInsets(content);
        if (Build.VERSION.SDK_INT >= 35 && !dark) {
            try {
                androidx.core.view.WindowInsetsControllerCompat bars = androidx.core.view.WindowCompat.getInsetsController(
                        getWindow(), getWindow().getDecorView());
                bars.setAppearanceLightStatusBars(true);
                bars.setAppearanceLightNavigationBars(true);
            } catch (Throwable t) {
                Log.w(TAG, "AlarmActivity: the phone's own icons stay white on this light theme", t);
            }
        }
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
        // A pushed alarm about a moment, not a task (the commute "time to
        // leave"): "Got it" only stops it too. It used to open the app on the
        // push's screen (Anna, Oct 30 2026: "I just pressed got it on the leave
        // now alarm and it opened the app"). The server also marks that push as
        // an event now; this covers any other task-less alarm.
        if (!openList && (taskId == null || taskId.isEmpty())) {
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
            // One Back does nothing but say how to close it; a second Back within
            // 3 seconds closes it as before (Anna, Nov 8 2026: "Somehow I clicked
            // somewhere random on an alarm and it closed. I didnt click a button"
            // - her 10 AM alarm closed with Back two seconds after it started,
            // most likely a tap near the screen edge read as the back swipe).
            long now = SystemClock.elapsedRealtime();
            if (firstBackAt == 0L || now - firstBackAt > BACK_AGAIN_MS) {
                firstBackAt = now;
                Log.d(TAG, "AlarmActivity: first Back while ringing, waiting for a second");
                try {
                    Toast.makeText(this, "Press Back again to close", Toast.LENGTH_SHORT).show();
                } catch (Exception ex) {
                    Log.w(TAG, "AlarmActivity: could not show the Back hint", ex);
                }
                return;
            }
            Log.d(TAG, "AlarmActivity: Back twice while ringing");
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
