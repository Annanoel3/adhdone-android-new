package co.median.android.odxqpdy;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;

/**
 * RecorderService — the note-taking recorder. Keeps the microphone recording with the
 * screen off or the app in the background, for as long as a meeting, appointment or
 * lecture runs, until the person taps Stop (in the app or on its notification).
 *
 * Android only allows that from a foreground service of type "microphone", which has
 * to show a notification the whole time ("Recording for notes", with a running clock
 * and Pause / Stop buttons). It can only be started while the app is open, which is
 * always the case here: the person taps Record on the notes page.
 *
 * The audio is saved in parts of about 10 minutes each (AAC in .m4a, mono, 64 kbps,
 * roughly 5 MB a part), for three reasons: a dead battery or a crash loses at most the
 * part being written; each part stays under the transcription service's 25 MB upload
 * limit; and each part can be transcribed well inside a backend function's time limit.
 * On Android 8+ the switch to the next part is seamless (setNextOutputFile); on 7 there
 * is a gap of a fraction of a second every 10 minutes.
 *
 * Everything about a recording is written to disk as it happens (RecorderStore), so the
 * web app can pick it up whenever it's next open, even if the WebView was asleep for the
 * whole recording. Live changes are also passed to RecorderBridge as events.
 */
public class RecorderService extends Service {

    private static final String TAG = "ADHDone";

    static final String ACTION_START = "co.median.android.odxqpdy.recorder.START";
    static final String ACTION_STOP = "co.median.android.odxqpdy.recorder.STOP";
    static final String ACTION_PAUSE = "co.median.android.odxqpdy.recorder.PAUSE";
    static final String ACTION_RESUME = "co.median.android.odxqpdy.recorder.RESUME";
    static final String EXTRA_ID = "sessionId";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_MAX_MINUTES = "maxMinutes";

    private static final String CHANNEL_ID = "adhdone_recorder";
    private static final String CHANNEL_NAME = "Recording for notes";
    private static final int NOTIFICATION_ID = 7301;

    // ~10.4 minutes at 64 kbps. Android warns at about 90% of this, which is when the
    // next part's file is handed over.
    private static final long PART_BYTES = 5_000_000L;
    // Android 7 has no seamless handover, so parts end by length instead.
    private static final int PART_MS = 10 * 60 * 1000;
    private static final int BIT_RATE = 64_000;
    private static final int SAMPLE_RATE = 44_100;
    // A forgotten recording must not run until the phone is full. The web app may ask
    // for less; nothing may ask for more.
    private static final int HARD_MAX_MINUTES = 8 * 60;
    private static final long TICK_MS = 30_000L;

    /** Receives live changes (RecorderBridge). */
    interface Listener {
        void onRecorderEvent(String type, JSONObject session, String error);
    }

    static volatile Listener listener;
    /** The recording in progress, or null. Read by RecorderBridge and RecorderStore. */
    static volatile String activeId;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private MediaRecorder recorder;
    private JSONObject session;
    private int partIndex = 0;
    private boolean paused = false;
    private long runStartedAt = 0;   // SystemClock.elapsedRealtime() when the current run began
    private long accumulatedMs = 0;  // recorded time before the current run
    private long maxMs = HARD_MAX_MINUTES * 60_000L;
    private PowerManager.WakeLock wakeLock;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (session == null) return;
            long elapsed = elapsedMs();
            if (elapsed >= maxMs) {
                stopRecording("time_limit");
                return;
            }
            saveElapsed();
            handler.postDelayed(this, TICK_MS);
        }
    };

    static void start(Context ctx, String id, String title, int maxMinutes) {
        Intent i = new Intent(ctx, RecorderService.class)
                .setAction(ACTION_START)
                .putExtra(EXTRA_ID, id)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_MAX_MINUTES, maxMinutes);
        ContextCompat.startForegroundService(ctx, i);
    }

    static void send(Context ctx, String action) {
        Intent i = new Intent(ctx, RecorderService.class).setAction(action);
        try {
            ctx.startService(i);
        } catch (Exception e) {
            Log.w(TAG, "Recorder: could not reach the recording service for " + action, e);
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_START.equals(action)) {
            // Android requires the notification within seconds of the start, before
            // anything that could fail.
            boolean foreground = goForeground();
            if (session != null) {
                // Already recording: a second Record tap changes nothing.
                emit("started", null);
                return START_NOT_STICKY;
            }
            String id = RecorderStore.safe(intent.getStringExtra(EXTRA_ID));
            String title = intent.getStringExtra(EXTRA_TITLE);
            int maxMinutes = intent.getIntExtra(EXTRA_MAX_MINUTES, HARD_MAX_MINUTES);
            if (maxMinutes <= 0 || maxMinutes > HARD_MAX_MINUTES) maxMinutes = HARD_MAX_MINUTES;
            maxMs = maxMinutes * 60_000L;
            if (!foreground) {
                // Android refused (the app wasn't on screen). Recording now would be cut
                // off or silenced, so it doesn't start at all.
                refuse(id, title, "service_blocked");
                return START_NOT_STICKY;
            }
            beginSession(id, title);
        } else if (ACTION_PAUSE.equals(action)) {
            pauseRecording();
        } else if (ACTION_RESUME.equals(action)) {
            resumeRecording();
        } else if (ACTION_STOP.equals(action)) {
            if (session != null) {
                stopRecording(null);
            } else {
                finishService();
            }
        } else if (session == null) {
            // Restarted by the system with nothing to do (a recording can't be resumed
            // from the background; Android doesn't allow the microphone then).
            finishService();
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        // Torn down with a recording still open: keep every finished part, and close the
        // current one properly if the recorder still lets us.
        if (session != null) stopRecording("service_ended");
        handler.removeCallbacksAndMessages(null);
        releaseWakeLock();
        super.onDestroy();
    }

    // ── Recording ────────────────────────────────────────────────────────────

    private void beginSession(String id, String title) {
        if (id.isEmpty()) id = "rec" + System.currentTimeMillis();
        RecorderStore.settleOrphans(this, null);
        JSONObject s = new JSONObject();
        try {
            s.put("id", id);
            s.put("title", title == null ? "" : title);
            s.put("startedAt", System.currentTimeMillis());
            s.put("stoppedAt", JSONObject.NULL);
            s.put("state", "recording");
            s.put("elapsedMs", 0);
            s.put("error", JSONObject.NULL);
            s.put("parts", new JSONArray());
        } catch (JSONException ignored) { }
        session = s;
        activeId = id;
        partIndex = 0;
        accumulatedMs = 0;
        paused = false;

        String problem = startPart();
        if (problem != null) {
            session = null;
            activeId = null;
            refuse(id, title, problem);
            return;
        }
        runStartedAt = SystemClock.elapsedRealtime();
        acquireWakeLock();
        RecorderStore.write(this, s);
        updateNotification();
        handler.postDelayed(tick, TICK_MS);
        emit("started", null);
    }

    // A recording that never got going: saved as stopped with the reason, so the web
    // app can say what happened, and nothing is left running.
    private void refuse(String id, String title, String problem) {
        if (id == null || id.isEmpty()) id = "rec" + System.currentTimeMillis();
        JSONObject s = new JSONObject();
        try {
            s.put("id", id);
            s.put("title", title == null ? "" : title);
            s.put("startedAt", System.currentTimeMillis());
            s.put("stoppedAt", System.currentTimeMillis());
            s.put("state", "stopped");
            s.put("elapsedMs", 0);
            s.put("error", problem);
            s.put("parts", new JSONArray());
        } catch (JSONException ignored) { }
        RecorderStore.write(this, s);
        emit("error", s, problem);
        finishService();
    }

    /** Starts a fresh recorder writing part number partIndex. Returns a problem, or null. */
    private String startPart() {
        File file = RecorderStore.partFile(this, activeId, partIndex);
        File dir = file.getParentFile();
        if (dir != null && !dir.exists()) dir.mkdirs();
        MediaRecorder r = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(this) : new MediaRecorder();
        try {
            r.setAudioSource(MediaRecorder.AudioSource.MIC);
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            r.setAudioChannels(1);
            r.setAudioSamplingRate(SAMPLE_RATE);
            r.setAudioEncodingBitRate(BIT_RATE);
            r.setOutputFile(file.getAbsolutePath());
            if (Build.VERSION.SDK_INT >= 26) {
                r.setMaxFileSize(PART_BYTES);
            } else {
                r.setMaxDuration(PART_MS);
            }
            r.setOnInfoListener((mr, what, extra) -> onInfo(what));
            r.setOnErrorListener((mr, what, extra) -> {
                Log.w(TAG, "Recorder: MediaRecorder error " + what + "/" + extra);
                handler.post(() -> stopRecording("recorder_error"));
            });
            r.prepare();
            r.start();
        } catch (Exception e) {
            Log.w(TAG, "Recorder: could not start the microphone", e);
            try { r.release(); } catch (Exception ignored) { }
            file.delete();
            return "mic_unavailable";
        }
        recorder = r;
        addPart(partIndex, elapsedMs());
        return null;
    }

    private void onInfo(int what) {
        if (session == null) return;
        if (Build.VERSION.SDK_INT >= 26 && what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_APPROACHING) {
            // Hand over the next part's file now; Android switches to it on its own when
            // this part is full, without dropping a moment of sound.
            try {
                recorder.setNextOutputFile(RecorderStore.partFile(this, activeId, partIndex + 1));
            } catch (Exception e) {
                Log.w(TAG, "Recorder: could not queue the next part; will restart instead", e);
            }
        } else if (Build.VERSION.SDK_INT >= 26 && what == MediaRecorder.MEDIA_RECORDER_INFO_NEXT_OUTPUT_FILE_STARTED) {
            long now = elapsedMs();
            finishPart(partIndex, now, true);
            partIndex++;
            addPart(partIndex, now);
            RecorderStore.write(this, session);
            emit("part", null);
        } else if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED
                || what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) {
            // The recorder has stopped itself (Android 7, or the handover failed). Close
            // this part and carry straight on with a new recorder.
            long now = elapsedMs();
            releaseRecorder(false);
            finishPart(partIndex, now, true);
            partIndex++;
            String problem = startPart();
            RecorderStore.write(this, session);
            emit("part", null);
            if (problem != null) stopRecording(problem);
        }
    }

    private void pauseRecording() {
        if (session == null || paused || recorder == null) return;
        try {
            recorder.pause();
        } catch (Exception e) {
            Log.w(TAG, "Recorder: pause failed", e);
            return;
        }
        accumulatedMs += SystemClock.elapsedRealtime() - runStartedAt;
        paused = true;
        setState("paused");
        updateNotification();
        emit("paused", null);
    }

    private void resumeRecording() {
        if (session == null || !paused || recorder == null) return;
        try {
            recorder.resume();
        } catch (Exception e) {
            Log.w(TAG, "Recorder: resume failed", e);
            return;
        }
        runStartedAt = SystemClock.elapsedRealtime();
        paused = false;
        setState("recording");
        updateNotification();
        emit("resumed", null);
    }

    /** reason: null when the person stopped it; otherwise why it stopped on its own. */
    private void stopRecording(String reason) {
        if (session == null) return;
        handler.removeCallbacks(tick);
        long now = elapsedMs();
        boolean closed = releaseRecorder(true);
        finishPart(partIndex, now, closed);
        try {
            session.put("state", "stopped");
            session.put("stoppedAt", System.currentTimeMillis());
            session.put("elapsedMs", now);
            session.put("error", reason == null ? JSONObject.NULL : reason);
        } catch (JSONException ignored) { }
        RecorderStore.write(this, session);
        JSONObject done = session;
        session = null;
        activeId = null;
        releaseWakeLock();
        emit("stopped", done, reason);
        finishService();
    }

    /** Stops and frees the recorder. Returns whether the part on disk was closed properly. */
    private boolean releaseRecorder(boolean stop) {
        if (recorder == null) return false;
        boolean ok = true;
        if (stop) {
            try {
                recorder.stop();
            } catch (Exception e) {
                // Stopped before any sound was captured: that file has nothing in it.
                ok = false;
            }
        }
        try { recorder.release(); } catch (Exception ignored) { }
        recorder = null;
        return ok;
    }

    private long elapsedMs() {
        if (session == null) return accumulatedMs;
        return paused ? accumulatedMs : accumulatedMs + (SystemClock.elapsedRealtime() - runStartedAt);
    }

    // ── session.json ─────────────────────────────────────────────────────────

    private void addPart(int index, long startMs) {
        try {
            JSONObject p = new JSONObject();
            p.put("index", index);
            p.put("file", RecorderStore.partFile(this, activeId, index).getName());
            p.put("startMs", startMs);
            p.put("endMs", JSONObject.NULL);
            p.put("bytes", 0);
            p.put("ok", true);
            session.getJSONArray("parts").put(p);
        } catch (JSONException ignored) { }
    }

    private void finishPart(int index, long endMs, boolean ok) {
        try {
            JSONArray parts = session.getJSONArray("parts");
            for (int i = parts.length() - 1; i >= 0; i--) {
                JSONObject p = parts.getJSONObject(i);
                if (p.optInt("index", -1) != index) continue;
                File f = RecorderStore.partFile(this, activeId, index);
                long bytes = f.exists() ? f.length() : 0;
                p.put("endMs", endMs);
                p.put("bytes", bytes);
                p.put("ok", ok && bytes > 0);
                if (bytes == 0) f.delete();
                break;
            }
        } catch (JSONException ignored) { }
    }

    private void setState(String state) {
        try {
            session.put("state", state);
            session.put("elapsedMs", elapsedMs());
        } catch (JSONException ignored) { }
        RecorderStore.write(this, session);
    }

    private void saveElapsed() {
        try {
            session.put("elapsedMs", elapsedMs());
        } catch (JSONException ignored) { }
        RecorderStore.write(this, session);
    }

    private void emit(String type, JSONObject s, String error) {
        Listener l = listener;
        if (l == null) return;
        try {
            l.onRecorderEvent(type, s != null ? s : session, error);
        } catch (Exception e) {
            Log.w(TAG, "Recorder: event listener failed", e);
        }
    }

    private void emit(String type, String error) {
        emit(type, null, error);
    }

    // ── Notification / foreground ────────────────────────────────────────────

    private boolean goForeground() {
        ensureChannel();
        Notification n = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
            return true;
        } catch (Exception e) {
            // Android refuses a microphone service when the app isn't in the foreground.
            Log.w(TAG, "Recorder: could not start in the foreground", e);
            return false;
        }
    }

    private void updateNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIFICATION_ID, buildNotification());
    }

    private Notification buildNotification() {
        String title = session != null ? session.optString("title", "") : "";
        boolean isPaused = paused && session != null;
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_adhdone)
                .setContentTitle(isPaused ? "Recording paused" : "Recording for notes")
                // The Pause and Stop buttons only show once the notification is
                // expanded, so the text can't send people to a Stop they may not
                // see; a tap on the notification itself opens Record Notes, where
                // Stop is (Anna, Oct 26 2026: the tap opened the app on Home and
                // "doesn't actually stop the recording").
                .setContentText(title.isEmpty() ? "Tap to open the recording. Stop it when it's over and ADHDone makes your notes."
                        : title + " — tap to open the recording")
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);
        if (session != null && !isPaused) {
            b.setUsesChronometer(true).setShowWhen(true)
                    .setWhen(System.currentTimeMillis() - elapsedMs());
        } else {
            b.setShowWhen(false);
        }

        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open != null) {
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            // Lands on Record Notes (the same path hand-off the widget and the
            // alarm screen use), not Home.
            open.putExtra(WidgetBridge.EXTRA_WIDGET_PATH, "/Notes");
            b.setContentIntent(PendingIntent.getActivity(this, NOTIFICATION_ID, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }
        if (session != null) {
            b.addAction(0, isPaused ? "Resume" : "Pause",
                    serviceIntent(isPaused ? ACTION_RESUME : ACTION_PAUSE, 1));
            b.addAction(0, "Stop", serviceIntent(ACTION_STOP, 2));
        }
        return b.build();
    }

    private PendingIntent serviceIntent(String action, int code) {
        Intent i = new Intent(this, RecorderService.class).setAction(action);
        return PendingIntent.getService(this, NOTIFICATION_ID + code, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel c = new NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW);
        c.setDescription("Shows while ADHDone is recording a meeting, appointment or class for notes.");
        c.setSound(null, null);
        c.enableVibration(false);
        c.setShowBadge(false);
        nm.createNotificationChannel(c);
    }

    private void finishService() {
        try {
            if (Build.VERSION.SDK_INT >= 24) {
                stopForeground(Service.STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
        } catch (Exception ignored) { }
        stopSelf();
    }

    // Keeps the processor awake for the recorder with the screen off. Released on stop;
    // the timeout is only a backstop.
    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ADHDone:recorder");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(maxMs + 60_000L);
        } catch (Exception e) {
            Log.w(TAG, "Recorder: no wake lock", e);
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) { }
        wakeLock = null;
    }
}
