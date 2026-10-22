package co.median.android.odxqpdy;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * RecorderStore — where the note-taking recorder keeps its recordings on the phone.
 *
 * Each recording is a folder under the app's private files (never the cache, which
 * Android may clear when storage is low):
 *
 *   files/recordings/<sessionId>/session.json
 *   files/recordings/<sessionId>/part-000.m4a, part-001.m4a, ...
 *
 * session.json is the record of truth, rewritten after every change, so a recording
 * survives the app being closed, the WebView sleeping, or the phone restarting:
 *
 *   { id, title, startedAt, stoppedAt, state, elapsedMs, error,
 *     parts: [{ index, file, startMs, endMs, bytes, ok }] }
 *
 * state is "recording", "paused", "stopped" or "interrupted" (the app was killed
 * mid-recording). startMs/endMs are positions in the recording itself, not the
 * clock, so paused time never counts. A part that was still being written when the
 * app died can't be read (ok=false); every finished part before it is fine.
 *
 * Nothing here ever leaves the phone. The web app reads parts (RecorderBridge) and
 * deletes a recording once it has what it needs.
 */
final class RecorderStore {

    private static final String TAG = "ADHDone";
    private static final String DIR = "recordings";
    private static final String META = "session.json";

    private RecorderStore() {}

    static File root(Context ctx) {
        File dir = new File(ctx.getFilesDir(), DIR);
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    static File sessionDir(Context ctx, String id) {
        return new File(root(ctx), safe(id));
    }

    static File partFile(Context ctx, String id, int index) {
        return new File(sessionDir(ctx, id), String.format(java.util.Locale.US, "part-%03d.m4a", index));
    }

    // Session ids come from the phone itself, but never let one reach outside the folder.
    static String safe(String id) {
        return id == null ? "" : id.replaceAll("[^A-Za-z0-9_-]", "");
    }

    static synchronized JSONObject read(Context ctx, String id) {
        File f = new File(sessionDir(ctx, id), META);
        if (!f.exists()) return null;
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[(int) f.length()];
            int off = 0;
            while (off < buf.length) {
                int n = in.read(buf, off, buf.length - off);
                if (n < 0) break;
                off += n;
            }
            return new JSONObject(new String(buf, 0, off, StandardCharsets.UTF_8));
        } catch (Exception e) {
            Log.w(TAG, "Recorder: could not read " + f, e);
            return null;
        }
    }

    // Written to a temp file and renamed, so a crash mid-write never leaves half a file.
    static synchronized void write(Context ctx, JSONObject session) {
        String id = session.optString("id");
        File dir = sessionDir(ctx, id);
        if (!dir.exists()) dir.mkdirs();
        File tmp = new File(dir, META + ".tmp");
        File dest = new File(dir, META);
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(session.toString().getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        } catch (Exception e) {
            Log.w(TAG, "Recorder: could not save " + dest, e);
            return;
        }
        if (!tmp.renameTo(dest)) {
            dest.delete();
            if (!tmp.renameTo(dest)) Log.w(TAG, "Recorder: could not move " + tmp + " into place");
        }
    }

    // Newest first.
    static List<JSONObject> all(Context ctx) {
        List<JSONObject> list = new ArrayList<>();
        File[] dirs = root(ctx).listFiles();
        if (dirs == null) return list;
        for (File d : dirs) {
            if (!d.isDirectory()) continue;
            JSONObject s = read(ctx, d.getName());
            if (s != null) list.add(s);
        }
        Collections.sort(list, (a, b) -> Long.compare(b.optLong("startedAt"), a.optLong("startedAt")));
        return list;
    }

    static boolean delete(Context ctx, String id) {
        File dir = sessionDir(ctx, id);
        if (!dir.exists() || safe(id).isEmpty()) return false;
        File[] files = dir.listFiles();
        if (files != null) for (File f : files) f.delete();
        return dir.delete();
    }

    /**
     * A recording the store still calls "recording" or "paused" while no recorder is
     * running was cut off: the app was killed, or the phone restarted. It becomes
     * "interrupted", and the part that was being written is marked unreadable.
     */
    static void settleOrphans(Context ctx, String activeId) {
        for (JSONObject s : all(ctx)) {
            String state = s.optString("state");
            if (!"recording".equals(state) && !"paused".equals(state)) continue;
            if (activeId != null && activeId.equals(s.optString("id"))) continue;
            try {
                s.put("state", "interrupted");
                if (!s.has("stoppedAt") || s.isNull("stoppedAt")) s.put("stoppedAt", System.currentTimeMillis());
                JSONArray parts = s.optJSONArray("parts");
                if (parts != null && parts.length() > 0) {
                    JSONObject last = parts.getJSONObject(parts.length() - 1);
                    if (!last.has("endMs") || last.isNull("endMs")) last.put("ok", false);
                }
            } catch (JSONException ignored) { }
            write(ctx, s);
        }
    }
}
