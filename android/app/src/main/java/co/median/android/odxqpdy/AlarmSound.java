package co.median.android.odxqpdy;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The sound an alarm rings with.
 *
 * The web app owns the choice (a preset from Anna's sound bucket, or a file the
 * user uploaded) and hands native the URL through AlarmBridge.setSound. Native
 * downloads it ONCE into the app's private files directory and rings from that
 * copy, so an alarm sounds right with no network at all. If nothing has been
 * chosen, or the download has not succeeded yet, AlarmService falls back to the
 * phone's default alarm tone — an alarm never stays silent over a missing file.
 *
 * Prefs hold the chosen url + display name, and the url the local file was
 * fetched for. The file is only trusted when those two urls match.
 */
final class AlarmSound {

    private static final String TAG = "ADHDone";
    private static final String PREFS = "adhdone_alarm_sound";
    private static final String KEY_URL = "url";
    private static final String KEY_NAME = "name";
    private static final String KEY_READY_URL = "ready_url";
    private static final String FILE_NAME = "adhdone_alarm_sound";
    private static final long MAX_BYTES = 15L * 1024 * 1024;
    private static final int TIMEOUT_MS = 20_000;

    private static final ExecutorService pool = Executors.newSingleThreadExecutor();

    interface Callback {
        void done(String result);
    }

    private AlarmSound() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static File file(Context c) {
        return new File(c.getFilesDir(), FILE_NAME);
    }

    static String url(Context c) {
        return prefs(c).getString(KEY_URL, "");
    }

    static String name(Context c) {
        return prefs(c).getString(KEY_NAME, "");
    }

    /** True when the chosen sound is on disk and matches the current choice. */
    static boolean ready(Context c) {
        String url = url(c);
        if (url.isEmpty()) {
            return false;
        }
        // The spoken alarm has nothing to download: it is ready the moment it is chosen.
        if (url.startsWith(AlarmSpeech.URL_PREFIX)) {
            return true;
        }
        File f = file(c);
        return url.equals(prefs(c).getString(KEY_READY_URL, "")) && f.isFile() && f.length() > 0;
    }

    /** The local copy to ring with, or null to use the default tone (or, for the spoken alarm, no file at all). */
    static Uri readyUri(Context c) {
        if (AlarmSpeech.chosen(c)) {
            return null;
        }
        return ready(c) ? Uri.fromFile(file(c)) : null;
    }

    // ---- Per-alarm sounds (a timer's own pick), cached one file per URL. ----

    private static File extraFile(Context c, String url) {
        return new File(c.getFilesDir(), FILE_NAME + "_x" + Integer.toHexString(url.hashCode()));
    }

    /** A per-alarm sound's cached copy, or null when it is not on disk (yet). */
    static Uri cachedUri(Context c, String url) {
        if (url == null || url.trim().isEmpty()) {
            return null;
        }
        File f = extraFile(c, url.trim());
        return f.isFile() && f.length() > 0 ? Uri.fromFile(f) : null;
    }

    /** Fetches a per-alarm sound in the background unless it is already cached. */
    static void prefetch(Context c, String url) {
        final Context app = c.getApplicationContext();
        final String u = url == null ? "" : url.trim();
        if (u.isEmpty() || cachedUri(app, u) != null) {
            return;
        }
        pool.execute(new Runnable() {
            @Override
            public void run() {
                File target = extraFile(app, u);
                boolean ok = downloadTo(u, target, new File(app.getFilesDir(), target.getName() + ".part"));
                Log.d(TAG, "AlarmSound: per-alarm sound " + (ok ? "cached" : "NOT fetched"));
            }
        });
    }

    /**
     * Records a new choice and fetches it in the background. An empty url clears
     * the choice (default tone). Results: cleared, cached, downloaded, failed.
     */
    static void set(Context c, String url, String name, Callback cb) {
        final String u = url == null ? "" : url.trim();
        final String n = name == null ? "" : name.trim();
        SharedPreferences p = prefs(c);
        if (u.isEmpty()) {
            p.edit().remove(KEY_URL).remove(KEY_NAME).remove(KEY_READY_URL).apply();
            //noinspection ResultOfMethodCallIgnored
            file(c).delete();
            if (cb != null) {
                cb.done("cleared");
            }
            return;
        }
        boolean changed = !u.equals(p.getString(KEY_URL, ""));
        p.edit().putString(KEY_URL, u).putString(KEY_NAME, n).apply();
        if (changed) {
            // The old file belongs to the old choice; never ring the wrong sound.
            p.edit().remove(KEY_READY_URL).apply();
        }
        if (u.startsWith(AlarmSpeech.URL_PREFIX)) {
            // Spoken: the phone's own voice reads the reminder (see AlarmSpeech).
            // Nothing to fetch, and the old file is not this choice.
            //noinspection ResultOfMethodCallIgnored
            file(c).delete();
            p.edit().putString(KEY_READY_URL, u).apply();
            if (cb != null) {
                cb.done("spoken");
            }
            return;
        }
        ensureDownloaded(c, cb);
    }

    /** Fetches the chosen sound if it is not on disk yet. Safe to call often. */
    static void ensureDownloaded(final Context c, final Callback cb) {
        final Context app = c.getApplicationContext();
        if (ready(app)) {
            if (cb != null) {
                cb.done("cached");
            }
            return;
        }
        final String url = url(app);
        if (url.isEmpty()) {
            if (cb != null) {
                cb.done("cleared");
            }
            return;
        }
        pool.execute(new Runnable() {
            @Override
            public void run() {
                boolean ok = download(app, url);
                if (cb != null) {
                    cb.done(ok ? "downloaded" : "failed");
                }
            }
        });
    }

    private static boolean download(Context c, String url) {
        boolean ok = downloadTo(url, file(c), new File(c.getFilesDir(), FILE_NAME + ".part"));
        // Only mark ready if the choice has not changed while we were fetching.
        if (ok && url.equals(url(c))) {
            prefs(c).edit().putString(KEY_READY_URL, url).apply();
        }
        return ok;
    }

    private static boolean downloadTo(String url, File target, File tmp) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);
            conn.setInstanceFollowRedirects(true);
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                Log.w(TAG, "AlarmSound: download failed, HTTP " + code);
                return false;
            }
            long total = 0;
            try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(tmp)) {
                byte[] buf = new byte[16 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) {
                    total += n;
                    if (total > MAX_BYTES) {
                        Log.w(TAG, "AlarmSound: file too large, giving up");
                        return false;
                    }
                    out.write(buf, 0, n);
                }
            }
            if (total == 0) {
                return false;
            }
            //noinspection ResultOfMethodCallIgnored
            target.delete();
            if (!tmp.renameTo(target)) {
                Log.w(TAG, "AlarmSound: could not move downloaded file into place");
                return false;
            }
            Log.d(TAG, "AlarmSound: downloaded " + total + " bytes");
            return true;
        } catch (Exception e) {
            Log.w(TAG, "AlarmSound: download failed", e);
            return false;
        } finally {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            if (conn != null) {
                conn.disconnect();
            }
        }
    }
}
