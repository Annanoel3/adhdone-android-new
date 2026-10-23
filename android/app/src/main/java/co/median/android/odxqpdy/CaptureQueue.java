package co.median.android.odxqpdy;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Durable on-device queue of captured text.
 *
 * Every capture is written here synchronously (commit(), not apply()) before anything else
 * happens, so a capture survives process death, force-stop and reboot even if the sending
 * process is killed a millisecond later. It is a list — captures never overwrite each other.
 *
 * Items are only removed once the task has actually been created in base44.
 */
public final class CaptureQueue {

    private static final String TAG = "ADHDone";

    private static final String PREFS_NAME = "adhdone_capture_queue";
    private static final String KEY_ITEMS = "items";

    /** Waiting to be sent (or retried after a transient failure). */
    static final String STATE_PENDING = "pending";
    /** The stored token was rejected; needs a fresh session before it can be sent. */
    static final String STATE_NEEDS_AUTH = "needs_auth";

    /**
     * Captured by replying to the pinned notification. No activity is in the foreground, so
     * the only place a toast can be shown is after the drain.
     */
    static final String SOURCE_REPLY = "reply";
    /**
     * Captured from the share sheet. CaptureActivity is genuinely in the foreground at that
     * moment and shows the toast itself, so the drain must NOT toast again.
     */
    static final String SOURCE_SHARE = "share";

    /**
     * Typed inside the app, which went off screen (or the phone locked) before it finished
     * setting the task up; handed over by ShareBridge.handOffCapture. The app shows its own
     * placeholder card, so the drain does not toast.
     */
    static final String SOURCE_APP = "app";

    private static final Object LOCK = new Object();

    private CaptureQueue() {
    }

    /** One queued capture. */
    static final class Item {
        final String id;
        final String text;
        final long createdAt;
        final String state;
        final int attempts;
        /** Where the capture came from — decides who shows the "Task added" toast. */
        final String source;
        /**
         * A shared image (screenshot, flyer, photo): the path of its downscaled JPEG in
         * app storage. The server reads it into a sentence first, then that sentence goes
         * through captureText exactly like shared text. Empty for a text capture.
         */
        final String imagePath;

        Item(String id, String text, long createdAt, String state, int attempts, String source) {
            this(id, text, createdAt, state, attempts, source, "");
        }

        Item(String id, String text, long createdAt, String state, int attempts, String source, String imagePath) {
            this.id = id;
            this.text = text;
            this.createdAt = createdAt;
            this.state = state;
            this.attempts = attempts;
            this.source = source != null ? source : SOURCE_REPLY;
            this.imagePath = imagePath != null ? imagePath : "";
        }

        boolean isImage() {
            return !imagePath.isEmpty();
        }

        static Item fromJson(JSONObject o) {
            return new Item(
                    o.optString("id"),
                    o.optString("text"),
                    o.optLong("createdAt"),
                    o.optString("state", STATE_PENDING),
                    o.optInt("attempts", 0),
                    // Items queued by an older build have no source; treating them as
                    // replies means they still get a toast rather than none.
                    o.optString("source", SOURCE_REPLY),
                    o.optString("imagePath", ""));
        }

        JSONObject toJson() throws Exception {
            JSONObject o = new JSONObject();
            o.put("id", id);
            o.put("text", text);
            o.put("createdAt", createdAt);
            o.put("state", state);
            o.put("attempts", attempts);
            o.put("source", source);
            o.put("imagePath", imagePath);
            return o;
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    /**
     * Append a capture. Returns the generated id, or null if the text was empty.
     * Uses commit() so the write is on disk before this returns.
     */
    /** Append a capture from the notification-reply path. */
    static String enqueue(Context context, String text) {
        return enqueue(context, text, SOURCE_REPLY);
    }

    static String enqueue(Context context, String text, String source) {
        if (text == null) {
            return null;
        }
        String trimmed = text.trim();
        if (trimmed.isEmpty()) {
            return null;
        }

        synchronized (LOCK) {
            List<Item> items = readAll(context);
            String id = UUID.randomUUID().toString();
            items.add(new Item(id, trimmed, System.currentTimeMillis(), STATE_PENDING, 0, source));
            writeAll(context, items);
            Log.d(TAG, "CaptureQueue: enqueued " + id + " (" + items.size() + " queued)");
            return id;
        }
    }

    /**
     * Append a capture under the id the web app already gave it, so captureText's capture_id
     * check treats the app's own later attempt (when it is back on screen) as the same
     * capture. Handing over the same id twice changes nothing. Uses commit() like enqueue().
     */
    static boolean enqueueWithId(Context context, String id, String text, long createdAt, String source) {
        if (id == null || id.trim().isEmpty() || text == null || text.trim().isEmpty()) {
            return false;
        }
        synchronized (LOCK) {
            List<Item> items = readAll(context);
            for (Item item : items) {
                if (item.id.equals(id.trim())) {
                    return true;
                }
            }
            long at = createdAt > 0 ? createdAt : System.currentTimeMillis();
            items.add(new Item(id.trim(), text.trim(), at, STATE_PENDING, 0, source));
            writeAll(context, items);
            Log.d(TAG, "CaptureQueue: handed over " + id + " (" + items.size() + " queued)");
            return true;
        }
    }

    /** Append a shared image (its JPEG already saved under app storage). Returns the id. */
    static String enqueueImage(Context context, String imagePath, String source) {
        if (imagePath == null || imagePath.trim().isEmpty()) {
            return null;
        }
        synchronized (LOCK) {
            List<Item> items = readAll(context);
            String id = UUID.randomUUID().toString();
            items.add(new Item(id, "", System.currentTimeMillis(), STATE_PENDING, 0, source, imagePath.trim()));
            writeAll(context, items);
            Log.d(TAG, "CaptureQueue: enqueued image " + id + " (" + items.size() + " queued)");
            return id;
        }
    }

    /** Every queued item, oldest first. */
    static List<Item> all(Context context) {
        synchronized (LOCK) {
            return readAll(context);
        }
    }

    /** Remove an item — only call this once the task exists in base44. */
    static void remove(Context context, String id) {
        synchronized (LOCK) {
            List<Item> items = readAll(context);
            List<Item> kept = new ArrayList<>();
            for (Item item : items) {
                if (!item.id.equals(id)) {
                    kept.add(item);
                }
            }
            writeAll(context, kept);
            Log.d(TAG, "CaptureQueue: removed " + id + " (" + kept.size() + " left)");
        }
    }

    /**
     * A shared image has been read into a sentence: keep that sentence on the item and
     * drop the image path, so a later retry sends the text straight to captureText (same
     * id, same capture_id) instead of needing the picture — which is deleted after this.
     */
    static void promoteToText(Context context, String id, String text) {
        synchronized (LOCK) {
            List<Item> items = readAll(context);
            List<Item> updated = new ArrayList<>();
            for (Item item : items) {
                if (item.id.equals(id)) {
                    updated.add(new Item(item.id, text, item.createdAt, item.state, item.attempts, item.source, ""));
                } else {
                    updated.add(item);
                }
            }
            writeAll(context, updated);
        }
    }

    /** Update an item's state and bump its attempt counter. */
    static void mark(Context context, String id, String state) {
        synchronized (LOCK) {
            List<Item> items = readAll(context);
            List<Item> updated = new ArrayList<>();
            for (Item item : items) {
                if (item.id.equals(id)) {
                    updated.add(new Item(item.id, item.text, item.createdAt, state, item.attempts + 1, item.source, item.imagePath));
                } else {
                    updated.add(item);
                }
            }
            writeAll(context, updated);
        }
    }

    /** Move every needs-auth item back to pending — call after a fresh session is stored. */
    static int revivePendingAuth(Context context) {
        synchronized (LOCK) {
            List<Item> items = readAll(context);
            List<Item> updated = new ArrayList<>();
            int revived = 0;
            for (Item item : items) {
                if (STATE_NEEDS_AUTH.equals(item.state)) {
                    updated.add(new Item(item.id, item.text, item.createdAt, STATE_PENDING, item.attempts, item.source, item.imagePath));
                    revived++;
                } else {
                    updated.add(item);
                }
            }
            if (revived > 0) {
                writeAll(context, updated);
                Log.d(TAG, "CaptureQueue: revived " + revived + " needs-auth item(s)");
            }
            return revived;
        }
    }

    static int size(Context context) {
        return all(context).size();
    }

    private static List<Item> readAll(Context context) {
        List<Item> items = new ArrayList<>();
        String raw = prefs(context).getString(KEY_ITEMS, "[]");
        try {
            JSONArray array = new JSONArray(raw);
            for (int i = 0; i < array.length(); i++) {
                JSONObject o = array.optJSONObject(i);
                if (o != null) {
                    items.add(Item.fromJson(o));
                }
            }
        } catch (Exception e) {
            // Never throw away the raw value silently; log loudly so it is diagnosable.
            Log.e(TAG, "CaptureQueue: could not parse queue, raw=" + raw, e);
        }
        return items;
    }

    private static void writeAll(Context context, List<Item> items) {
        JSONArray array = new JSONArray();
        for (Item item : items) {
            try {
                array.put(item.toJson());
            } catch (Exception e) {
                Log.e(TAG, "CaptureQueue: could not serialise item " + item.id, e);
            }
        }
        // commit(), not apply(): the calling process may be killed immediately after.
        prefs(context).edit().putString(KEY_ITEMS, array.toString()).commit();
    }
}
