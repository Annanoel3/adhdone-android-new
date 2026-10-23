package co.median.android.odxqpdy;

import android.content.Context;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * ShareBridge — bridges natively captured text (Android share sheet, quick-capture
 * notification reply) into the web app, and owns the quick-capture notification toggle.
 *
 * Called from the web app via: window.Capacitor.Plugins.ShareBridge.<method>()
 *
 * deliver() is native-only (MainActivity calls it); it is deliberately NOT a @PluginMethod.
 */
@CapacitorPlugin(name = "ShareBridge")
public class ShareBridge extends Plugin {

    private static final String TAG = "ADHDone";

    /** Buffer so text delivered before the web app boots is not lost. */
    private static String pendingSharedText = null;

    /**
     * Same idea for a shared image. Held as base64 because a content:// URI from another
     * app is readable by this process but not by the WebView, so the bytes have to cross
     * the bridge already encoded.
     */
    private static String pendingSharedImageBase64 = null;
    private static String pendingSharedImageMimeType = null;

    /** The currently loaded plugin instance, if any (used to fire the sharedText event). */
    private static ShareBridge instance = null;

    @Override
    public void load() {
        super.load();
        instance = this;
        Log.d(TAG, "ShareBridge loaded");
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
        super.handleOnDestroy();
    }

    /**
     * Native-only entry point, called by CaptureSyncWorker once the server has created
     * the task(s) for a capture. If the web app is loaded it gets a "captureLanded" event
     * so an open task list refreshes right away instead of on the next screen wake;
     * when the app is closed there is nobody to tell and nothing happens.
     */
    public static void captureLanded(int count) {
        ShareBridge plugin = instance;
        if (plugin == null) {
            return;
        }
        JSObject payload = new JSObject();
        payload.put("count", count);
        plugin.notifyListeners("captureLanded", payload);
    }

    /**
     * Native-only entry point. Always buffers the text, and additionally fires the
     * "sharedText" event when the plugin is loaded (warm start). On a cold start the
     * web app picks the text up with getPendingSharedText(). De-duplication is handled
     * web-side.
     */
    public static void deliver(String text) {
        if (text == null) {
            return;
        }
        String trimmed = text.trim();
        if (trimmed.isEmpty()) {
            return;
        }

        pendingSharedText = trimmed;
        Log.d(TAG, "ShareBridge.deliver: buffered " + trimmed.length() + " chars");

        ShareBridge plugin = instance;
        if (plugin != null) {
            JSObject payload = new JSObject();
            payload.put("text", trimmed);
            plugin.notifyListeners("sharedText", payload);
        }
    }

    /**
     * Native-only entry point for a shared image, mirroring deliver() for text. Always
     * buffers, and additionally fires the "sharedImage" event when the plugin is loaded
     * (warm start). On a cold start the web app collects it with getPendingSharedImage().
     * De-duplication is handled web-side.
     *
     * Called from a background thread by SharedImageReader.
     */
    public static void deliverImage(String base64, String mimeType) {
        if (base64 == null || base64.isEmpty()) {
            return;
        }
        String resolvedMime = (mimeType != null && !mimeType.isEmpty()) ? mimeType : "image/jpeg";

        pendingSharedImageBase64 = base64;
        pendingSharedImageMimeType = resolvedMime;
        Log.d(TAG, "ShareBridge.deliverImage: buffered " + base64.length() + " chars, " + resolvedMime);

        ShareBridge plugin = instance;
        if (plugin != null) {
            JSObject payload = new JSObject();
            payload.put("base64", base64);
            payload.put("mimeType", resolvedMime);
            plugin.notifyListeners("sharedImage", payload);
        }
    }

    /**
     * Returns the buffered image as { base64, mimeType } (empty strings if none) and
     * clears the buffer, mirroring getPendingSharedText().
     */
    @PluginMethod
    public void getPendingSharedImage(PluginCall call) {
        String base64 = pendingSharedImageBase64;
        String mimeType = pendingSharedImageMimeType;
        pendingSharedImageBase64 = null;
        pendingSharedImageMimeType = null;

        JSObject result = new JSObject();
        result.put("base64", base64 != null ? base64 : "");
        result.put("mimeType", mimeType != null ? mimeType : "");
        call.resolve(result);
    }

    /** Returns the buffered text (empty string if none) and clears the buffer. */
    @PluginMethod
    public void getPendingSharedText(PluginCall call) {
        String text = pendingSharedText;
        pendingSharedText = null;

        JSObject result = new JSObject();
        result.put("text", text != null ? text : "");
        call.resolve(result);
    }

    /**
     * The app went off screen (or the phone locked) while it was still setting up a task the
     * person typed in it. Android stops the app's own work from there, so the task used to wait
     * until the app was opened again (Oct 13 2026: "call propane 530-477-7854 today" sat
     * unmade on a phone). The capture is handed to the same background sender the share sheet
     * uses, which finishes it with the app closed: captureText, with the app's id as
     * capture_id, so nothing is made twice when the app comes back.
     * { id, text, createdAt } -> { queued }
     */
    @PluginMethod
    public void handOffCapture(PluginCall call) {
        String id = call.getString("id");
        String text = call.getString("text");
        Double createdAt = call.getDouble("createdAt");
        Context context = getContext();
        boolean queued = CaptureQueue.enqueueWithId(context, id, text,
                createdAt != null ? createdAt.longValue() : 0L, CaptureQueue.SOURCE_APP);
        if (queued) {
            CaptureSyncWorker.kick(context);
        }
        Log.d(TAG, "handOffCapture: " + (queued ? "queued " + id : "nothing to queue"));
        JSObject result = new JSObject();
        result.put("queued", queued);
        call.resolve(result);
    }

    /** Turn the persistent quick-capture notification on or off (persisted across reboots). */
    @PluginMethod
    public void setQuickCaptureEnabled(PluginCall call) {
        boolean requested = Boolean.TRUE.equals(call.getBoolean("enabled", Boolean.FALSE));
        Context context = getContext();
        JSObject result = new JSObject();

        // Refuse consistently on every API level when a posted notification would not
        // actually be visible. The web app requests POST_NOTIFICATIONS via
        // NotifyBridge.requestPermission(); we only report what is blocking.
        String blocked = requested ? QuickCapture.blockReason(context) : QuickCapture.REASON_NONE;
        if (requested && !QuickCapture.REASON_NONE.equals(blocked)) {
            QuickCapture.setEnabled(context, false);
            QuickCapture.cancel(context);
            QuickCapture.cancelKeepAlive(context);
            result.put("enabled", false);
            result.put("reason", blocked);
            Log.d(TAG, "setQuickCaptureEnabled: refused, blocked by " + blocked);
            call.resolve(result);
            return;
        }

        QuickCapture.setEnabled(context, requested);
        if (requested) {
            QuickCapture.post(context);
            QuickCapture.scheduleKeepAlive(context);
        } else {
            QuickCapture.cancel(context);
            QuickCapture.cancelKeepAlive(context);
        }

        Log.d(TAG, "setQuickCaptureEnabled: " + requested);
        result.put("enabled", requested);
        result.put("reason", QuickCapture.REASON_NONE);
        call.resolve(result);
    }

    /**
     * Effective state of the quick-capture notification.
     *
     * "enabled" is only true when the user turned it on AND the OS would actually show it,
     * so the web toggle can never read ON while nothing is in the status bar. When the
     * preference is on and nothing is blocking, the notification is re-posted first — that
     * repairs the case where the user blocked notifications (which clears it) and then
     * re-allowed them.
     */
    @PluginMethod
    public void isQuickCaptureEnabled(PluginCall call) {
        Context context = getContext();
        boolean preference = QuickCapture.isEnabled(context);
        String blocked = preference ? QuickCapture.blockReason(context) : QuickCapture.REASON_NONE;
        boolean effective = preference && QuickCapture.REASON_NONE.equals(blocked);

        if (effective) {
            // Idempotent: same notification id, so this refreshes rather than duplicates.
            QuickCapture.post(context);
            // Re-arm if the scheduled work was ever lost (KEEP makes this a no-op otherwise).
            QuickCapture.scheduleKeepAlive(context);
        }

        JSObject result = new JSObject();
        result.put("enabled", effective);
        result.put("preference", preference);
        result.put("blocked", preference && !QuickCapture.REASON_NONE.equals(blocked));
        result.put("reason", blocked);
        call.resolve(result);
    }
}
