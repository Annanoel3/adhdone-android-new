package co.median.android.odxqpdy;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.audiofx.LoudnessEnhancer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;

import android.media.AudioManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * The ringing. Started by AlarmReceiver as a foreground service so Android does
 * not kill it mid-ring.
 *
 * Plays the sound the user chose in the app (downloaded once by AlarmSound),
 * else a bundled res/raw/adhdone_alarm if one is shipped, else the phone's
 * default alarm tone — on the ALARM audio stream, which is what gets through
 * silent mode and, by default, Do Not Disturb. Vibrates. Posts a
 * full-screen notification: when the phone is locked or asleep that launches
 * AlarmActivity over the lock screen; when the phone is in use Android shows it
 * as a heads-up banner instead, with Snooze and Dismiss actions on it.
 *
 * Rings for RING_MS, then stops on its own and counts as ignored. No choice
 * means no choice: nothing is re-rung or rescheduled because of it — the
 * task's remaining reminders carry on as booked. Only a tapped snooze rings
 * again.
 */
public class AlarmService extends Service {

    private static final String TAG = "ADHDone";

    static final String ACTION_RING = "co.median.android.odxqpdy.ALARM_RING";
    static final String ACTION_SNOOZE = "co.median.android.odxqpdy.ALARM_SNOOZE";
    static final String ACTION_DISMISS = "co.median.android.odxqpdy.ALARM_DISMISS";
    static final String ACTION_IGNORE = "co.median.android.odxqpdy.ALARM_IGNORE";
    /** "Done" on the alarm: the task is being marked done, so this is not a dismissal. */
    static final String ACTION_DONE = "co.median.android.odxqpdy.ALARM_DONE";
    static final String ACTION_LATER = "co.median.android.odxqpdy.ALARM_LATER";
    /** The task was finished or deleted elsewhere (PushFilter): its ring stops, nothing counted. */
    static final String ACTION_STOP_TASK = "co.median.android.odxqpdy.ALARM_STOP_TASK";
    /**
     * Home or Back (or the screen closing some other way) while it rang, with
     * none of its buttons used. EXTRA_HOW says which: "home", "back", "closed".
     */
    static final String ACTION_LEFT = "co.median.android.odxqpdy.ALARM_LEFT";
    static final String EXTRA_HOW = "adhdone_left_how";
    static final String EXTRA_MINUTES = "adhdone_snooze_minutes";
    static final String EXTRA_TASK = "adhdone_task_id";

    /**
     * Two alarms for different tasks that don't go together (PairDecisions):
     * the second rings no sooner than this after the first one ends, never
     * straight after it (Anna, Oct 10 2026). The server keeps the same spacing
     * between its own pushes (sendLedger). A reminder at a time the person set
     * themselves (isPinned) is never moved, and never waits behind a reminder
     * the app picked: that one makes way for it (makeWay).
     */
    static final long APART_MS = 10L * 60L * 1000L;
    private static final String SPACING_PREFS = "adhdone_alarm_spacing";
    private static final String KEY_LAST_END_AT = "last_end_at";
    private static final String KEY_LAST_END_TASK = "last_end_task";
    private static final String KEY_LAST_END_TITLE = "last_end_title";

    // v2: a notification channel keeps the importance it was FIRST created with,
    // so a new id guarantees every phone gets a high-importance (heads-up) channel.
    static final String CHANNEL_ID = "adhdone_alarm_v2";
    private static final String OLD_CHANNEL_ID = "adhdone_alarm";
    private static final String CHANNEL_NAME = "Alarms";
    /** Used only when the foreground service could not start: this channel makes the noise. */
    static final String LOUD_CHANNEL_ID = "adhdone_alarm_loud";
    private static final String LOUD_CHANNEL_NAME = "Alarms (backup)";
    /** The backup channel when the alarm should only vibrate (AlarmQuiet): no sound. */
    static final String VIBRATE_CHANNEL_ID = "adhdone_alarm_vibrate";
    private static final String VIBRATE_CHANNEL_NAME = "Alarms (vibrate only)";
    private static final long RING_MS = 60_000L;
    private static final int DEFAULT_SNOOZE_MINUTES = 10;

    /** Id of the alarm currently ringing, or null. Read by AlarmActivity. */
    private static volatile String ringingId = null;

    private MediaPlayer player;
    // The loudness booster on the tone's audio session (AlarmBoost).
    private LoudnessEnhancer boost;
    private AlarmSpeech speech;
    private Vibrator vibrator;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private String currentId;
    // Alarms that came due while another was ringing. Each rings in turn once the
    // one before it is answered or rings out — one used to cut off the other.
    private final java.util.ArrayDeque<String> waiting = new java.util.ArrayDeque<>();
    private final Runnable ringOut = new Runnable() {
        @Override
        public void run() {
            Log.d(TAG, "AlarmService: nobody answered, stopping " + currentId);
            ignore(currentId);
        }
    };

    static boolean isRinging(String id) {
        return id != null && id.equals(ringingId);
    }

    /** The alarm ringing right now, or null. */
    static String currentRingingId() {
        return ringingId;
    }

    /** "Display over other apps": lets the alarm screen open while the phone is in use. */
    static boolean canDrawOverlays(Context ctx) {
        try {
            return Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                    || android.provider.Settings.canDrawOverlays(ctx);
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * When an alarm last rang on this phone, and how many have rung in all. Data
     * only: the web app reads it to know whether the person has actually heard a
     * full-screen reminder yet (its "keep them?" question waits for that). Nothing
     * is scheduled or changed because of it.
     */
    private static final String STATS_PREFS = "adhdone_alarm_stats";
    private static final String KEY_LAST_RANG_AT = "last_rang_at";
    private static final String KEY_RANG_COUNT = "rang_count";

    static void noteRang(Context ctx) {
        try {
            android.content.SharedPreferences p = ctx.getSharedPreferences(STATS_PREFS, Context.MODE_PRIVATE);
            p.edit()
                    .putLong(KEY_LAST_RANG_AT, System.currentTimeMillis())
                    .putInt(KEY_RANG_COUNT, p.getInt(KEY_RANG_COUNT, 0) + 1)
                    .apply();
        } catch (Exception ignored) {
        }
    }

    static long lastRangAt(Context ctx) {
        return ctx.getSharedPreferences(STATS_PREFS, Context.MODE_PRIVATE).getLong(KEY_LAST_RANG_AT, 0L);
    }

    static int rangCount(Context ctx) {
        return ctx.getSharedPreferences(STATS_PREFS, Context.MODE_PRIVATE).getInt(KEY_RANG_COUNT, 0);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_RING.equals(action)) {
            String id = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID);
            AlarmStore.Entry e = id != null ? AlarmStore.get(this, id) : null;
            if (e == null || e.done) {
                if (currentId == null) {
                    // Started as a foreground service: Android kills the app unless
                    // startForeground is called, even when there is nothing to ring.
                    stopQuietly();
                }
                return START_NOT_STICKY;
            }
            if (currentId != null && !currentId.equals(e.id)) {
                AlarmStore.Entry ringing = AlarmStore.get(this, currentId);
                if (sameTask(ringing, e)) {
                    // The same task is ringing right now (an hourly reminder and a
                    // snooze landing on the same minute): one ring, not two back to
                    // back. Whatever they answer covers this one too.
                    fold(e, "its task is already ringing");
                } else if (ringing != null && !isTimer(e) && !e.taskId.isEmpty()
                        && PairDecisions.together(this, ringing, e)) {
                    // A different task that goes with the one ringing (the AI's
                    // call, PairDecisions): one alarm that names both.
                    join(ringing, e);
                    AlarmActivity.refreshIfShowing(ringing.id);
                } else if (ringing != null && atTheirTime(e) && !atTheirTime(ringing)
                        && !isTimer(ringing) && !isTimer(e) && !e.taskId.isEmpty()) {
                    // This one is at a time they set themselves, so it rings now.
                    // The one ringing (a reminder the app picked, or a snooze
                    // coming back) makes way and comes back 10 minutes after
                    // this one ends. Anna, Oct 21 2026, on her 10 AM call ringing
                    // at 10:31 behind another task's alarm: "Events with a certain
                    // time cannot be happening at a different time."
                    makeWay(ringing, e);
                    return START_NOT_STICKY;
                } else if (!waiting.contains(e.id)) {
                    // Another alarm is ringing: this one waits its turn. A
                    // reminder the app picked then rings 10 minutes after it; one
                    // at a time they set rings the moment it ends (finishRinging).
                    waiting.add(e.id);
                }
                // This start came as a foreground-service start too: renew the
                // foreground state with the ringing alarm's own notification so
                // Android's start rule is met for it as well.
                if (ringing != null) {
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                            startForeground(AlarmScheduler.requestCode(ringing.id), buildNotification(ringing),
                                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                        } else {
                            startForeground(AlarmScheduler.requestCode(ringing.id), buildNotification(ringing));
                        }
                    } catch (Exception ex) {
                        Log.w(TAG, "AlarmService: could not renew the foreground state", ex);
                    }
                }
                return START_NOT_STICKY;
            }
            // A different task's alarm ended moments ago: this one waits until 10
            // minutes after it instead of ringing straight on its heels.
            long deferTo = deferredStart(e);
            if (deferTo > 0L) {
                e.at = deferTo;
                e.queuedBehind = getSharedPreferences(SPACING_PREFS, MODE_PRIVATE).getString(KEY_LAST_END_TITLE, "");
                AlarmStore.put(this, e);
                AlarmScheduler.schedule(this, e);
                Log.d(TAG, "AlarmService: " + e.id + " waits until " + deferTo + ", another task's alarm just ended");
                stopQuietly();
                return START_NOT_STICKY;
            }
            startRinging(e);
        } else if (ACTION_STOP_TASK.equals(action)) {
            stopForTask(intent.getStringExtra(EXTRA_TASK));
        } else if (ACTION_SNOOZE.equals(action)) {
            snooze(targetId(intent), intent.getIntExtra(EXTRA_MINUTES, DEFAULT_SNOOZE_MINUTES));
        } else if (ACTION_DISMISS.equals(action)) {
            dismiss(targetId(intent));
        } else if (ACTION_IGNORE.equals(action)) {
            ignore(targetId(intent));
        } else if (ACTION_DONE.equals(action)) {
            markedDone(targetId(intent));
        } else if (ACTION_LATER.equals(action)) {
            later(targetId(intent));
        } else if (ACTION_LEFT.equals(action)) {
            leftRinging(targetId(intent), intent.getStringExtra(EXTRA_HOW));
        } else if (currentId == null) {
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    /**
     * Which alarm a button meant: the one named in the intent (a banner or screen
     * belongs to one alarm), else the one ringing. Acting on "whatever rings now"
     * made Snooze on one alarm snooze another.
     */
    private String targetId(Intent intent) {
        String id = intent != null ? intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID) : null;
        return id != null && !id.isEmpty() ? id : currentId;
    }

    /** Started for nothing to ring: satisfy Android's foreground rule, then stop. */
    private void stopQuietly() {
        try {
            ensureChannel(this);
            Notification n = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_launcher_foreground)
                    .setContentTitle("ADHDone")
                    .setSilent(true)
                    .build();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(QUIET_STOP_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(QUIET_STOP_ID, n);
            }
        } catch (Exception ex) {
            Log.w(TAG, "AlarmService: could not enter foreground before stopping", ex);
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private static final int QUIET_STOP_ID = 0x4AFFFFFF;

    private void startRinging(AlarmStore.Entry e) {
        currentId = e.id;
        ringingId = e.id;
        ensureChannel(this);
        // Other tasks' alarms due within a couple of minutes that go with this
        // one ring with it, as one alarm naming them all (PairDecisions).
        if (!isTimer(e) && !e.taskId.isEmpty()) {
            long now = System.currentTimeMillis();
            for (AlarmStore.Entry o : AlarmStore.load(this)) {
                if (o.done || o.id.equals(e.id) || o.taskId.isEmpty() || sameTask(o, e) || isTimer(o)) {
                    continue;
                }
                if (o.at < now - 60_000L || o.at > now + PairDecisions.WINDOW_MS) {
                    continue;
                }
                // A reminder at a time they set themselves is never pulled early.
                if (isPinned(o) && o.at > now + 60_000L) {
                    continue;
                }
                if (PairDecisions.together(this, e, o)) {
                    join(e, o);
                }
            }
        }
        // While it rings, the alarm is the reminder: its quiet copy in the tray
        // goes (two rows for one reminder, Oct 10 2026). If nobody answers, a
        // copy comes back so it can still be found there (see ignore).
        PushFilter.cancelMutedPush(this, e.taskId);
        PushFilter.cancelMutedPush(this, e.id);

        Notification notification = buildNotification(e);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(AlarmScheduler.requestCode(e.id), notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(AlarmScheduler.requestCode(e.id), notification);
        }

        // Silent / vibrate / Do Not Disturb and the person chose "only vibrate":
        // no sound, the vibration and the screen still come.
        if (!AlarmQuiet.vibrateOnly(this)) {
            startSound(e);
        }
        startVibration();
        noteRang(this);
        RingLog.rang(this, e);
        if (!e.queuedBehind.isEmpty()) {
            e.queuedBehind = "";
            AlarmStore.put(this, e);
        }
        handler.removeCallbacks(ringOut);
        handler.postDelayed(ringOut, RING_MS);

        // The full-screen intent only takes over when the screen is off or locked;
        // with the phone unlocked and in use Android shows a heads-up banner instead
        // (which is what "I got a notification but no full screen" looks like).
        // We may start the alarm screen ourselves in two cases: ADHDone is already
        // on screen, or the user granted "Display over other apps", which is what
        // lets an alarm interrupt whatever they are doing. Otherwise the banner has
        // Snooze / Stop and opens the alarm screen on tap.
        if (MainActivity.isInForeground() || canDrawOverlays(this)) {
            try {
                Intent full = new Intent(this, AlarmActivity.class)
                        .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
                        .putExtra(AlarmScheduler.EXTRA_ALARM_ID, e.id);
                startActivity(full);
            } catch (Exception ex) {
                Log.w(TAG, "AlarmService: could not open the alarm screen directly", ex);
            }
        }
    }

    /**
     * Rings without a foreground service (see AlarmReceiver). The notification goes
     * on the loud channel so it sounds and vibrates on its own; when the phone is
     * locked its full-screen intent opens AlarmActivity, which loops the chosen
     * sound until Snooze or Dismiss.
     */
    static void ringWithoutService(Context context, AlarmStore.Entry e) {
        if (e == null || e.done) {
            return;
        }
        ensureChannel(context);
        // Vibrate-only (see AlarmQuiet): the backup channel that buzzes but makes no sound.
        boolean quiet = AlarmQuiet.vibrateOnly(context);
        Notification n = buildNotification(context, e, quiet ? VIBRATE_CHANNEL_ID : LOUD_CHANNEL_ID, false, quiet, RING_MS);
        try {
            NotificationManagerCompat.from(context).notify(AlarmScheduler.requestCode(e.id), n);
            noteRang(context);
            RingLog.rang(context, e);
        } catch (SecurityException ex) {
            Log.e(TAG, "AlarmService: notifications not permitted, alarm could not be shown", ex);
        }
    }

    private Notification buildNotification(AlarmStore.Entry e) {
        return buildNotification(this, e, CHANNEL_ID, true, false, 0L);
    }

    private static Notification buildNotification(Context ctx, AlarmStore.Entry e, String channelId, boolean silent,
                                                  boolean vibrateOnly, long timeoutMs) {
        Intent full = new Intent(ctx, AlarmActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra(AlarmScheduler.EXTRA_ALARM_ID, e.id);
        PendingIntent fullScreen = PendingIntent.getActivity(ctx, AlarmScheduler.requestCode(e.id), full,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        PendingIntent snooze = servicePendingIntent(ctx, ACTION_SNOOZE, e.id, 10, 1);
        PendingIntent dismiss = servicePendingIntent(ctx, ACTION_DISMISS, e.id, 0, 2);

        // Same words the push notification for this moment carries (its title
        // and body). The alarm only changes HOW the reminder arrives, never
        // what it says. Only when the web app sent no wording at all does the
        // task title stand in.
        String title = e.title.isEmpty() ? ctx.getString(R.string.alarm_title_fallback) : e.title;
        String heading = e.heading == null || e.heading.isEmpty() ? title : e.heading;
        String body = withCompanions(e, e.body == null || e.body.isEmpty() ? "" : e.body);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, channelId)
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle(heading)
                .setContentText(body.isEmpty() ? title : body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body.isEmpty() ? title : body))
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(fullScreen)
                .setFullScreenIntent(fullScreen, true);
        if (timeoutMs > 0L) {
            b.setTimeoutAfter(timeoutMs);
        }
        // Re-posting it (a second alarm came due while this rang) must not
        // re-alert or re-open anything.
        b.setOnlyAlertOnce(true);
        if (!e.noSnooze && !e.event) {
            b.addAction(0, ctx.getString(R.string.alarm_action_snooze_10), snooze);
        }
        // Ringing together with other tasks: Done is picked on the alarm screen,
        // one task at a time (the banner can't say which).
        if (AlarmActivity.canMarkDone(e, e.taskId) && e.companionTaskIds().isEmpty()) {
            // Done straight from the banner: opens the alarm screen, which stops
            // the ring and hands the task to the app to mark done.
            Intent doneIntent = new Intent(ctx, AlarmActivity.class)
                    .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    .putExtra(AlarmScheduler.EXTRA_ALARM_ID, e.id)
                    .putExtra(AlarmActivity.EXTRA_MARK_DONE, true);
            PendingIntent donePi = PendingIntent.getActivity(ctx, AlarmScheduler.requestCode(e.id) + 3, doneIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            b.addAction(0, ctx.getString(R.string.alarm_action_done), donePi);
        }
        b.addAction(0, ctx.getString(R.string.alarm_action_stop), dismiss);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Show the foreground-service notification at once, never after the
            // 10-second grace Android otherwise allows itself.
            b.setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);
        }
        if (silent) {
            // The service plays the sound; the CHANNEL is silent (no sound, no
            // vibration), which is all that is needed. Never setSilent(true) here:
            // NotificationCompat implements it by grouping the notification under a
            // summary that does not exist, and Android then treats it as
            // non-interruptive — no heads-up banner and, on Android 14+, no
            // full-screen intent either. That is exactly the alarm ringing with
            // nothing on screen to stop it.
        } else if (vibrateOnly) {
            // Pre-Oreo phones have no channels: vibrate, no sound.
            b.setVibrate(new long[]{0, 800, 400, 800, 400});
        } else {
            // Pre-Oreo phones have no channels: give the notification its own alarm sound.
            b.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), AudioManager.STREAM_ALARM)
                    .setVibrate(new long[]{0, 800, 400, 800, 400});
        }
        return b.build();
    }

    private static PendingIntent servicePendingIntent(Context ctx, String action, String id, int minutes, int slot) {
        Intent i = new Intent(ctx, AlarmService.class)
                .setAction(action)
                .putExtra(AlarmScheduler.EXTRA_ALARM_ID, id)
                .putExtra(EXTRA_MINUTES, minutes);
        int code = AlarmScheduler.requestCode(id) + slot;
        return PendingIntent.getService(ctx, code, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void startSound(final AlarmStore.Entry e) {
        stopSound();
        // The spoken alarm: the phone reads the reminder out loud instead of a
        // tone, unless this alarm brought its own sound (a timer's pick). If no
        // speech engine can start, the tone path below takes over.
        boolean ownPick = e != null && e.soundUrl != null && !e.soundUrl.trim().isEmpty();
        if (!ownPick && AlarmSpeech.chosen(this)) {
            speech = new AlarmSpeech(this);
            String words = AlarmSpeech.wordsFor(e, getString(R.string.alarm_title_fallback));
            java.util.List<String> also = e != null ? e.companionTitles() : new java.util.ArrayList<String>();
            if (!also.isEmpty()) {
                words = words + ". Also: " + AlarmSpeech.clean(android.text.TextUtils.join(", and ", also)) + ".";
            }
            speech.start(words, true, AudioAttributes.USAGE_ALARM, new AlarmSpeech.Listener() {
                @Override
                public void finished(boolean spoke) {
                    if (!spoke && speech != null && e != null && isRinging(e.id)) {
                        Log.w(TAG, "AlarmService: speech unavailable, ringing the tone instead");
                        speech = null;
                        startTone(e);
                    }
                }
            });
            return;
        }
        startTone(e);
    }

    private void startTone(AlarmStore.Entry e) {
        // A timer's own pick first (cached when it was booked); then the
        // account-wide alarm sound; then the bundled tone; then the phone's.
        Uri uri = e != null ? AlarmSound.cachedUri(this, e.soundUrl) : null;
        if (uri == null) {
            uri = AlarmSound.readyUri(this);
        }
        if (uri == null) {
            int res = getResources().getIdentifier("adhdone_alarm", "raw", getPackageName());
            if (res != 0) {
                uri = Uri.parse("android.resource://" + getPackageName() + "/" + res);
            }
        }
        if (uri == null) {
            uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        }
        if (uri == null) {
            uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        }
        if (uri == null) {
            Log.w(TAG, "AlarmService: no alarm sound available");
            return;
        }
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            player.setDataSource(this, uri);
            player.setLooping(true);
            player.prepare();
            boost = AlarmBoost.attach(player.getAudioSessionId(), "alarm tone");
            player.start();
        } catch (Exception ex) {
            Log.e(TAG, "AlarmService: could not play alarm sound", ex);
            stopSound();
        }
    }

    private void stopSound() {
        if (speech != null) {
            speech.stop();
            speech = null;
        }
        AlarmBoost.release(boost);
        boost = null;
        if (player != null) {
            try {
                if (player.isPlaying()) {
                    player.stop();
                }
            } catch (Exception ignored) {
            }
            player.release();
            player = null;
        }
    }

    private void startVibration() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            vibrator = vm != null ? vm.getDefaultVibrator() : null;
        } else {
            vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        }
        if (vibrator == null || !vibrator.hasVibrator()) {
            return;
        }
        long[] pattern = {0, 800, 400, 800, 400};
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0),
                    new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
        } else {
            vibrator.vibrate(pattern, 0);
        }
    }

    private void stopVibration() {
        if (vibrator != null) {
            vibrator.cancel();
            vibrator = null;
        }
    }

    private void snooze(String id, int minutes) {
        snooze(id, minutes, null);
    }

    /** by: "home" / "back" when Home or Back did the snoozing (leftRinging), else null. */
    private void snooze(String id, int minutes, String by) {
        if (id != null) {
            AlarmStore.Entry e = AlarmStore.get(this, id);
            if (e != null && !e.done) {
                e.at = System.currentTimeMillis() + Math.max(1, minutes) * 60_000L;
                e.snoozes += 1;
                e.reported = false;
                // The server hears now (Smart Reminders sees the snooze and when it
                // comes back), app open or not: ChoiceReports.
                e.sentSnoozes = e.snoozes;
                AlarmStore.put(this, e);
                AlarmScheduler.schedule(this, e);
                RingLog.ended(this, id, RingLog.END_SNOOZED, Math.max(1, minutes), by);
                report(e, ChoiceReports.SNOOZE, Math.max(1, minutes), e.at, by);
                PairDecisions.prepareAsync(this);
                Log.d(TAG, "AlarmService: snoozed " + id + " for " + minutes + " min");
                // Another alarm for this task booked within a couple of minutes of
                // the snooze (an hourly reminder under a 1 hour snooze) would ring
                // twice in a row; the snooze is the one that rings.
                for (AlarmStore.Entry o : AlarmStore.load(this)) {
                    if (!o.done && !o.id.equals(e.id) && sameTask(e, o)
                            && Math.abs(o.at - e.at) <= SAME_TASK_WINDOW_MS) {
                        AlarmScheduler.cancel(this, o.id);
                        fold(o, "the snooze rings for it");
                    }
                }
            }
            waiting.remove(id);
        }
        finishRinging(id);
    }

    /** The user stopped it without picking a snooze. Counted; nothing rescheduled. */
    private void dismiss(String id) {
        if (id != null) {
            AlarmStore.Entry e = AlarmStore.get(this, id);
            if (e != null) {
                e.done = true;
                e.dismissed = true;
                e.reported = false;
                e.sentDismissed = true;
                AlarmStore.put(this, e);
                PushFilter.cancelMutedPush(this, e.taskId);
                // A pushed alarm's tray copy is keyed by the entry id (it may have no task).
                PushFilter.cancelMutedPush(this, e.id);
                report(e, ChoiceReports.DISMISS, 0, 0L);
            }
            AlarmScheduler.cancel(this, id);
            waiting.remove(id);
            RingLog.ended(this, id, RingLog.END_DISMISSED, 0);
            Log.d(TAG, "AlarmService: dismissed " + id);
        }
        finishRinging(id);
    }

    /**
     * "Later": this ring is over, with no set snooze time. Nothing is rescheduled
     * here: the task keeps its normal reminders, which for anything smart nudges
     * handle means the nudge planner decides when to bring it up again. Counted
     * as a Later (not a dismissal) so the planner can see it was put off.
     */
    private void later(String id) {
        if (id != null) {
            AlarmStore.Entry e = AlarmStore.get(this, id);
            if (e != null) {
                e.done = true;
                AlarmStore.put(this, e);
                PushFilter.cancelMutedPush(this, e.taskId);
                PushFilter.cancelMutedPush(this, e.id);
                // The break (LaterBreak): the task's alarms come off this phone now
                // and the server is told. Only when the server can't be reached is
                // the tap counted here, for the app's next sync to apply the break.
                // The server is told through the report queue (sent at once, or
                // as soon as there's a connection), so nothing waits for the app.
                // Tasks ringing together with it get the same break.
                LaterBreak.start(getApplicationContext(), e.taskId);
                for (String other : e.companionTaskIds()) {
                    LaterBreak.start(getApplicationContext(), other);
                }
            }
            AlarmScheduler.cancel(this, id);
            waiting.remove(id);
            RingLog.ended(this, id, RingLog.END_LATER, 0);
            Log.d(TAG, "AlarmService: later " + id);
        }
        finishRinging(id);
    }

    /** Home or Back on an alarm that rings through quiet hours: it rings again this soon. */
    private static final int LEFT_SNOOZE_MINUTES = 10;

    /**
     * Home or Back while it rang, none of its buttons used (Anna, Oct 12 2026:
     * "the alarm be stopped by pressing home or back and those actions would
     * just put it back in smart reminder rotation. And tracking when those
     * happen would be good"). The ring stops, nothing is booked here, and the
     * server is told it was closed with no answer: that's counted on the task,
     * and Smart Reminders takes a fresh look and decides when it comes up
     * again. Not a Later, so there's no break.
     *
     * The one exception: an alarm ringing inside quiet hours because it's at a
     * time they set themselves (a 5 AM flight). One sleepy Home press must not
     * silence the only alarm they asked for, and Smart Reminders never speaks
     * up in quiet hours, so that one rings again in 10 minutes.
     */
    private void leftRinging(String id, String how) {
        String by = "home".equals(how) || "back".equals(how) ? how : "closed";
        AlarmStore.Entry e = id != null ? AlarmStore.get(this, id) : null;
        if (e != null && !e.done && e.throughQuiet) {
            snooze(id, LEFT_SNOOZE_MINUTES, by);
            return;
        }
        if (id != null) {
            if (e != null) {
                e.done = true;
                AlarmStore.put(this, e);
                report(e, ChoiceReports.CLOSED, 0, 0L, by);
                // Back in the tray, quietly, so it can still be found there (its
                // copy was taken away while it rang), the same as ringing out.
                if (!e.taskId.isEmpty() && !isTimer(e)) {
                    // A quiet copy of this reminder that reached the tray after
                    // the ring started (the push can land a moment after the
                    // alarm took its copy away) goes now, so this is the one row
                    // (Anna, Oct 17 2026: two rows a minute apart for one
                    // reminder, "Clean the litter box" 9:09 and 9:10 PM).
                    PushFilter.cancelMutedPush(this, e.taskId);
                    PushFilter.cancelMutedPush(this, e.id);
                    TaskActions.postRecord(this, e);
                }
            }
            AlarmScheduler.cancel(this, id);
            waiting.remove(id);
            RingLog.ended(this, id, RingLog.END_CLOSED, 0, by);
            Log.d(TAG, "AlarmService: closed with " + by + " " + id);
        }
        finishRinging(id);
    }

    /** "Done" on the alarm: over for good, and not counted as a dismissal. */
    private void markedDone(String id) {
        if (id != null) {
            AlarmStore.Entry e = AlarmStore.get(this, id);
            if (e != null) {
                e.done = true;
                AlarmStore.put(this, e);
                PushFilter.cancelMutedPush(this, e.taskId);
                PushFilter.cancelMutedPush(this, e.id);
                // Done here means the task is finished on this phone. A push for
                // it that was already on its way (its own reminder at this same
                // minute) is dropped when it lands, instead of sounding after the
                // alarm was answered (Oct 12 2026: the 9 PM litter box rang, was
                // marked done, then sounded again as a notification).
                if (e.taskId != null && !e.taskId.isEmpty()) {
                    TaskPushes.finished(this, e.taskId, System.currentTimeMillis());
                }
            }
            AlarmScheduler.cancel(this, id);
            waiting.remove(id);
            RingLog.ended(this, id, RingLog.END_DONE, 0);
            Log.d(TAG, "AlarmService: marked done from the alarm " + id);
        }
        finishRinging(id);
    }

    /** Rang out with no response. Counted; nothing rescheduled. */
    private void ignore(String id) {
        if (id != null) {
            AlarmStore.Entry e = AlarmStore.get(this, id);
            if (e != null) {
                e.done = true;
                e.ignored += 1;
                e.reported = false;
                e.sentIgnored = e.ignored;
                AlarmStore.put(this, e);
                report(e, ChoiceReports.IGNORED, 0, 0L);
                // Nobody answered: the reminder goes back in the tray, quietly, so
                // it can still be found there (its copy was taken away while it rang).
                if (!e.taskId.isEmpty() && !isTimer(e)) {
                    // A quiet copy of this reminder that reached the tray after
                    // the ring started (the push can land a moment after the
                    // alarm took its copy away) goes now, so this is the one row
                    // (Anna, Oct 17 2026: two rows a minute apart for one
                    // reminder, "Clean the litter box" 9:09 and 9:10 PM).
                    PushFilter.cancelMutedPush(this, e.taskId);
                    PushFilter.cancelMutedPush(this, e.id);
                    TaskActions.postRecord(this, e);
                }
            }
            AlarmScheduler.cancel(this, id);
            waiting.remove(id);
            RingLog.ended(this, id, RingLog.END_IGNORED, 0);
            Log.d(TAG, "AlarmService: ignored " + id);
        }
        finishRinging(id);
    }

    /**
     * The button or ring-out was about alarm `answered`. If that is not the one
     * ringing (it was waiting, or the screen rang on its own), the current ring
     * carries on untouched.
     */
    /** Two alarms for one task within this long of each other ring once. */
    private static final long SAME_TASK_WINDOW_MS = 2L * 60L * 1000L;

    private static boolean sameTask(AlarmStore.Entry a, AlarmStore.Entry b) {
        return a != null && b != null && a.taskId != null && !a.taskId.isEmpty() && a.taskId.equals(b.taskId);
    }

    /** This alarm won't ring on its own: another ring for its task covers it. */
    private void fold(AlarmStore.Entry e, String why) {
        e.done = true;
        AlarmStore.put(this, e);
        RingLog.folded(this, e, why);
        Log.d(TAG, "AlarmService: " + e.id + " folded, " + why);
    }

    private void finishRinging(String answered) {
        if (answered != null && currentId != null && !answered.equals(currentId)) {
            AlarmActivity.closeIfShowing(answered);
            NotificationManagerCompat.from(this).cancel(AlarmScheduler.requestCode(answered));
            return;
        }
        handler.removeCallbacks(ringOut);
        stopSound();
        stopVibration();
        String id = currentId;
        ringingId = null;
        currentId = null;
        AlarmActivity.closeIfShowing(id);
        AlarmStore.Entry answeredEntry = id != null ? AlarmStore.get(this, id) : null;
        long endedAt = System.currentTimeMillis();
        if (answeredEntry != null && !answeredEntry.taskId.isEmpty() && !isTimer(answeredEntry)) {
            getSharedPreferences(SPACING_PREFS, MODE_PRIVATE).edit()
                    .putLong(KEY_LAST_END_AT, endedAt)
                    .putString(KEY_LAST_END_TASK, answeredEntry.taskId)
                    .putString(KEY_LAST_END_TITLE, answeredEntry.title)
                    .apply();
        }
        // Next in line, if one came due while this rang (and still wants ringing).
        // One for the same task was just answered with this one: it doesn't ring.
        while (!waiting.isEmpty()) {
            AlarmStore.Entry next = AlarmStore.get(this, waiting.poll());
            if (next != null && !next.done && sameTask(answeredEntry, next)) {
                fold(next, "its task was just answered");
                continue;
            }
            if (next != null && !next.done && answeredEntry != null && canDefer(next)) {
                // A different task: it rings 10 minutes after this one ended, not
                // straight after it (two rings in a row, Oct 10 2026).
                next.at = endedAt + APART_MS;
                next.queuedBehind = answeredEntry.title;
                AlarmStore.put(this, next);
                AlarmScheduler.schedule(this, next);
                Log.d(TAG, "AlarmService: " + next.id + " waits 10 minutes behind " + id);
                continue;
            }
            if (next != null && !next.done) {
                startRinging(next);
                if (id != null) {
                    NotificationManagerCompat.from(this).cancel(AlarmScheduler.requestCode(id));
                }
                return;
            }
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        if (id != null) {
            // The fallback path posts its notification itself; clear that one too.
            NotificationManagerCompat.from(this).cancel(AlarmScheduler.requestCode(id));
        }
        stopSelf();
    }

    private static boolean isTimer(AlarmStore.Entry e) {
        return e != null && e.id != null && e.id.startsWith(AlarmScheduler.TIMER_ALARM_PREFIX);
    }

    /**
     * A reminder at a time the person set themselves. The alarm list says so
     * (theirTime, build 43 on). Lists from before that only marked it with the
     * bell at the start of the heading, which the AI-written words for that
     * moment and the plain pin / calendar headings didn't have (Oct 21 2026).
     */
    private static boolean isPinned(AlarmStore.Entry e) {
        return e != null && (e.theirTime || (e.heading != null && e.heading.startsWith("\uD83D\uDD14")));
    }

    /** At a time they set, ringing at that very time: not a snooze coming back, not moved. */
    private static boolean atTheirTime(AlarmStore.Entry e) {
        return isPinned(e) && e.snoozes == 0 && Math.abs(e.at - e.originalAt) < 60_000L;
    }

    /**
     * `ringing` stops so `pinned` rings at the time they set for it. `ringing`
     * goes back to the front of the line: once `pinned` is answered or rings
     * out, it comes back 10 minutes later (finishRinging). Nothing is reported
     * for it, since nobody answered it.
     */
    private void makeWay(AlarmStore.Entry ringing, AlarmStore.Entry pinned) {
        handler.removeCallbacks(ringOut);
        stopSound();
        stopVibration();
        // Not ringing any more before its screen closes, so the screen closing
        // isn't taken as Home or Back (AlarmActivity.onDestroy).
        ringingId = null;
        currentId = null;
        AlarmActivity.closeIfShowing(ringing.id);
        NotificationManagerCompat.from(this).cancel(AlarmScheduler.requestCode(ringing.id));
        RingLog.ended(this, ringing.id, RingLog.END_MADE_WAY, 0);
        waiting.remove(ringing.id);
        waiting.addFirst(ringing.id);
        Log.d(TAG, "AlarmService: " + ringing.id + " makes way for " + pinned.id + ", a time they set");
        startRinging(pinned);
    }

    /**
     * May this alarm be moved to keep 10 minutes from another task's? Not a
     * timer's end, not one with no task (the commute "leave now"), not one at a
     * time the person set themselves.
     */
    private static boolean canDefer(AlarmStore.Entry e) {
        return e != null && !isTimer(e) && e.taskId != null && !e.taskId.isEmpty() && !isPinned(e)
                && (e.actionsJson == null || e.actionsJson.isEmpty());
    }

    /** When this alarm should ring instead of now, or 0 to ring now. */
    private long deferredStart(AlarmStore.Entry e) {
        if (!canDefer(e)) {
            return 0L;
        }
        android.content.SharedPreferences p = getSharedPreferences(SPACING_PREFS, MODE_PRIVATE);
        long lastEnd = p.getLong(KEY_LAST_END_AT, 0L);
        String lastTask = p.getString(KEY_LAST_END_TASK, "");
        long now = System.currentTimeMillis();
        if (lastEnd <= 0L || lastTask == null || lastTask.isEmpty() || lastTask.equals(e.taskId)) {
            return 0L;
        }
        // (A little slack: the deferred alarm itself fires right at lastEnd + 10 min.)
        if (now - lastEnd >= APART_MS - 30_000L || now < lastEnd) {
            return 0L;
        }
        return lastEnd + APART_MS;
    }

    /** Another task's alarm rings as part of this one (one alarm that names both). */
    private void join(AlarmStore.Entry primary, AlarmStore.Entry other) {
        primary.addCompanion(other);
        AlarmStore.put(this, primary);
        other.done = true;
        AlarmStore.put(this, other);
        AlarmScheduler.cancel(this, other.id);
        waiting.remove(other.id);
        PushFilter.cancelMutedPush(this, other.taskId);
        PushFilter.cancelMutedPush(this, other.id);
        RingLog.folded(this, other, "rang together with \"" + primary.title + "\"");
        Log.d(TAG, "AlarmService: " + other.id + " rings together with " + primary.id);
        if (primary.id.equals(currentId)) {
            try {
                NotificationManagerCompat.from(this).notify(AlarmScheduler.requestCode(primary.id), buildNotification(primary));
            } catch (SecurityException ignored) {
            }
        }
    }

    /** The body, plus the other tasks ringing with it ("Also: ..."). */
    static String withCompanions(AlarmStore.Entry e, String body) {
        java.util.List<String> also = e != null ? e.companionTitles() : new java.util.ArrayList<String>();
        if (also.isEmpty()) {
            return body;
        }
        String base = body == null || body.isEmpty() ? (e.title == null ? "" : e.title) : body;
        return base + "\n\nAlso: " + android.text.TextUtils.join(", ", also);
    }

    /** Send this choice to the server for the task and any ringing together with it. */
    private void report(AlarmStore.Entry e, String choice, int minutes, long untilMs) {
        report(e, choice, minutes, untilMs, null);
    }

    private void report(AlarmStore.Entry e, String choice, int minutes, long untilMs, String how) {
        if (e == null || e.taskId.isEmpty() || isTimer(e)) {
            return;
        }
        ChoiceReports.add(this, e.taskId, choice, minutes, untilMs, how);
        for (String other : e.companionTaskIds()) {
            ChoiceReports.add(this, other, choice, minutes, untilMs, how);
        }
    }

    /** Is this task's alarm (or one ringing together with it) ringing right now? */
    static boolean isRingingTask(Context ctx, String taskId) {
        String id = ringingId;
        if (id == null || taskId == null || taskId.isEmpty()) {
            return false;
        }
        AlarmStore.Entry e = AlarmStore.get(ctx, id);
        return e != null && (taskId.equals(e.taskId) || e.companionTaskIds().contains(taskId));
    }

    /** The task was finished or deleted elsewhere: if its alarm is ringing, it stops. */
    static void stopTask(Context ctx, String taskId) {
        if (!isRingingTask(ctx, taskId)) {
            return;
        }
        try {
            ctx.startService(new Intent(ctx, AlarmService.class)
                    .setAction(ACTION_STOP_TASK)
                    .putExtra(EXTRA_TASK, taskId));
        } catch (Exception e) {
            Log.w(TAG, "AlarmService: could not stop the ring for " + taskId, e);
        }
    }

    private void stopForTask(String taskId) {
        if (taskId == null || taskId.isEmpty()) {
            return;
        }
        java.util.Iterator<String> it = waiting.iterator();
        while (it.hasNext()) {
            AlarmStore.Entry w = AlarmStore.get(this, it.next());
            if (w != null && taskId.equals(w.taskId)) {
                w.done = true;
                AlarmStore.put(this, w);
                it.remove();
            }
        }
        AlarmStore.Entry cur = currentId != null ? AlarmStore.get(this, currentId) : null;
        if (cur != null && taskId.equals(cur.taskId)) {
            cur.done = true;
            AlarmStore.put(this, cur);
            AlarmScheduler.cancel(this, cur.id);
            RingLog.ended(this, cur.id, RingLog.END_DONE, 0);
            Log.d(TAG, "AlarmService: " + cur.id + " stopped, its task was finished elsewhere");
            finishRinging(cur.id);
        } else if (currentId == null) {
            stopSelf();
        }
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(ringOut);
        stopSound();
        stopVibration();
        if (currentId != null && currentId.equals(ringingId)) {
            ringingId = null;
        }
        super.onDestroy();
    }

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) {
            return;
        }
        try {
            if (nm.getNotificationChannel(OLD_CHANNEL_ID) != null) {
                nm.deleteNotificationChannel(OLD_CHANNEL_ID);
            }
        } catch (Exception ignored) {
        }
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Loud alarms for your most important tasks");
            // Sound comes from the service on the alarm stream, not from the channel.
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setBypassDnd(true); // honoured only if the user allows it in DND settings
            nm.createNotificationChannel(channel);
        }
        if (nm.getNotificationChannel(LOUD_CHANNEL_ID) == null) {
            NotificationChannel loud = new NotificationChannel(LOUD_CHANNEL_ID, LOUD_CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH);
            loud.setDescription("Backup alarm sound when the phone blocks the alarm service");
            loud.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                    new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build());
            loud.enableVibration(true);
            loud.setVibrationPattern(new long[]{0, 800, 400, 800, 400});
            loud.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            loud.setBypassDnd(true);
            nm.createNotificationChannel(loud);
        }
        if (nm.getNotificationChannel(VIBRATE_CHANNEL_ID) == null) {
            NotificationChannel buzz = new NotificationChannel(VIBRATE_CHANNEL_ID, VIBRATE_CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH);
            buzz.setDescription("Backup alarm that only vibrates, for when the phone is on silent or Do Not Disturb");
            buzz.setSound(null, null);
            buzz.enableVibration(true);
            buzz.setVibrationPattern(new long[]{0, 800, 400, 800, 400});
            buzz.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            buzz.setBypassDnd(true);
            nm.createNotificationChannel(buzz);
        }
    }
}
