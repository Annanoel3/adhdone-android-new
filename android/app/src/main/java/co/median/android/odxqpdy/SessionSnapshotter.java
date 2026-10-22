package co.median.android.odxqpdy;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.WebView;

import org.json.JSONObject;

/**
 * Copies the base44 session out of WebView localStorage into native storage.
 *
 * The web app keeps its access token, app id and server URL in localStorage, which native can
 * only read while a WebView exists. This runs a few times after the app opens (the page needs
 * to have booted and authenticated first) and stops as soon as it gets a token.
 *
 * Reads only; it never writes to the web app's storage.
 */
public final class SessionSnapshotter {

    private static final String TAG = "ADHDone";

    /** The page needs time to boot and authenticate, so retry on a widening schedule. */
    private static final long[] ATTEMPT_DELAYS_MS = { 3000, 8000, 20000, 45000 };

    private static final String READ_SCRIPT =
            "(function(){try{return JSON.stringify({"
                    + "token: localStorage.getItem('base44_access_token'),"
                    + "appId: localStorage.getItem('base44_app_id'),"
                    + "serverUrl: localStorage.getItem('base44_server_url')"
                    + "});}catch(e){return null;}})()";

    private SessionSnapshotter() {
    }

    /** Schedule snapshot attempts. Safe to call on every resume. */
    static void schedule(Activity activity, WebView webView) {
        if (activity == null || webView == null) {
            return;
        }
        Handler handler = new Handler(Looper.getMainLooper());
        for (long delay : ATTEMPT_DELAYS_MS) {
            handler.postDelayed(() -> attempt(activity, webView), delay);
        }
    }

    private static void attempt(Activity activity, WebView webView) {
        if (activity.isFinishing() || activity.isDestroyed()) {
            return;
        }
        try {
            webView.evaluateJavascript(READ_SCRIPT, value -> onResult(activity, value));
        } catch (Exception e) {
            Log.w(TAG, "SessionSnapshotter: evaluateJavascript failed: " + e.getMessage());
        }
    }

    private static void onResult(Activity activity, String value) {
        if (value == null || "null".equals(value)) {
            return;
        }
        try {
            // evaluateJavascript hands back a JSON-encoded string, so unwrap it once.
            String json = value;
            if (json.startsWith("\"")) {
                json = new JSONObject("{\"v\":" + json + "}").getString("v");
            }

            JSONObject parsed = new JSONObject(json);
            String token = nullSafe(parsed.optString("token", null));
            String appId = nullSafe(parsed.optString("appId", null));
            String serverUrl = nullSafe(parsed.optString("serverUrl", null));

            if (token == null || appId == null || serverUrl == null) {
                return;
            }

            boolean changed = Base44Session.store(activity, token, appId, serverUrl);
            if (changed) {
                // A fresh token: anything parked on needs-auth can be retried now.
                int revived = CaptureQueue.revivePendingAuth(activity);
                if (revived > 0) {
                    CaptureSyncWorker.kick(activity);
                }
            }
            if (CaptureQueue.size(activity) > 0) {
                CaptureSyncWorker.kick(activity);
            }
            // Alarm choices waiting on a fresh sign-in (ChoiceSyncWorker) go too.
            if (ChoiceReports.size(activity) > 0) {
                ChoiceSyncWorker.kick(activity);
            }
        } catch (Exception e) {
            Log.w(TAG, "SessionSnapshotter: could not parse session: " + e.getMessage());
        }
    }

    private static String nullSafe(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return (trimmed.isEmpty() || "null".equals(trimmed)) ? null : trimmed;
    }
}
