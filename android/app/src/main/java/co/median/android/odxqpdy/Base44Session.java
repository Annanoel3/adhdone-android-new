package co.median.android.odxqpdy;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import android.util.Log;

import org.json.JSONObject;

/**
 * The base44 session snapshotted out of the WebView.
 *
 * The web app keeps its access token in WebView localStorage, which native can only read
 * while the app is open. We copy it here on every app open so the capture pipeline can keep
 * working while the app is closed.
 *
 * Storage is app-private (/data/data/<pkg>/shared_prefs) and excluded from cloud backup via
 * the backup rules, so the token never leaves the device.
 */
public final class Base44Session {

    private static final String TAG = "ADHDone";

    private static final String PREFS_NAME = "adhdone_session";
    private static final String KEY_TOKEN = "access_token";
    private static final String KEY_APP_ID = "app_id";
    private static final String KEY_SERVER_URL = "server_url";
    private static final String KEY_UPDATED_AT = "updated_at";

    private Base44Session() {
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    static String getToken(Context context) {
        return prefs(context).getString(KEY_TOKEN, null);
    }

    static String getAppId(Context context) {
        return prefs(context).getString(KEY_APP_ID, null);
    }

    static String getServerUrl(Context context) {
        String url = prefs(context).getString(KEY_SERVER_URL, null);
        if (url == null || url.isEmpty()) {
            return null;
        }
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    /** True when we have everything needed to talk to base44. */
    static boolean isUsable(Context context) {
        return getToken(context) != null
                && getAppId(context) != null
                && getServerUrl(context) != null;
    }

    /**
     * Store a snapshot. Returns true when the token changed, which is the signal to revive
     * any needs-auth captures and retry them.
     */
    static boolean store(Context context, String token, String appId, String serverUrl) {
        if (token == null || token.isEmpty() || appId == null || appId.isEmpty()
                || serverUrl == null || serverUrl.isEmpty()) {
            return false;
        }

        String previous = getToken(context);
        boolean changed = !token.equals(previous);

        prefs(context).edit()
                .putString(KEY_TOKEN, token)
                .putString(KEY_APP_ID, appId)
                .putString(KEY_SERVER_URL, serverUrl)
                .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
                .commit();

        Log.d(TAG, "Base44Session: stored session (tokenChanged=" + changed + "), "
                + describeTokenLifetime(token));
        return changed;
    }

    /** Drop the stored token (e.g. after the server rejects it and the user logs out). */
    static void clearToken(Context context) {
        prefs(context).edit().remove(KEY_TOKEN).commit();
        Log.d(TAG, "Base44Session: token cleared");
    }

    /**
     * Best-effort decode of the token's expiry. base44 access tokens appear to be JWTs; if
     * this one is not, we say so rather than guessing. Returns epoch millis, or 0.
     */
    static long getTokenExpiryMillis(String token) {
        if (token == null) {
            return 0;
        }
        String[] parts = token.split("\\.");
        if (parts.length < 2) {
            return 0;
        }
        try {
            byte[] decoded = Base64.decode(parts[1], Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
            JSONObject payload = new JSONObject(new String(decoded, "UTF-8"));
            long exp = payload.optLong("exp", 0);
            return exp > 0 ? exp * 1000L : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    /**
     * Human-readable description of the token lifetime, logged on every snapshot so the
     * real TTL can be read straight out of logcat.
     */
    static String describeTokenLifetime(String token) {
        long expiry = getTokenExpiryMillis(token);
        if (expiry <= 0) {
            return "token is not a decodable JWT (no exp claim) — TTL unknown";
        }
        long issued = 0;
        try {
            String[] parts = token.split("\\.");
            byte[] decoded = Base64.decode(parts[1], Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
            issued = new JSONObject(new String(decoded, "UTF-8")).optLong("iat", 0) * 1000L;
        } catch (Exception ignored) {
            // iat is optional
        }

        long remainingMin = (expiry - System.currentTimeMillis()) / 60000L;
        String lifetime = issued > 0
                ? " totalLifetimeHours=" + ((expiry - issued) / 3600000L)
                : "";
        return "TOKEN TTL: expiresAt=" + expiry
                + " remainingMinutes=" + remainingMin + lifetime;
    }

    /** True when we can already tell the stored token is past its expiry. */
    static boolean isTokenExpired(Context context) {
        long expiry = getTokenExpiryMillis(getToken(context));
        // 0 means "cannot tell" — assume valid and let the server decide with a 401.
        return expiry > 0 && expiry <= System.currentTimeMillis();
    }
}
