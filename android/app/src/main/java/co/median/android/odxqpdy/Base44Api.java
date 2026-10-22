package co.median.android.odxqpdy;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.TimeZone;

/**
 * Minimal base44 client. Native is a pure relay: it hands the raw captured text to the
 * captureText backend function, which classifies, splits, parses, creates and schedules
 * everything server-side. Native assembles and saves nothing.
 *
 *   POST {serverUrl}/api/apps/{appId}/functions/captureText
 *   Authorization: Bearer <session token snapshotted from the WebView>
 *   { "text": ..., "timezone": ..., "capture_id": ... }
 *
 * Deliberately does NOT send a date: the server derives "today" from the timezone, which is
 * what fixed the date drift.
 */
public final class Base44Api {

    private static final String TAG = "ADHDone";

    static final String CAPTURE_FUNCTION = "captureText";
    /** Reads a shared image into a task sentence; that sentence then goes through captureText. */
    static final String READ_IMAGE_FUNCTION = "readImageCapture";

    private static final int CONNECT_TIMEOUT_MS = 15000;
    /** base44 measures 6-15s normally; retries are safe because capture_id is deduped. */
    private static final int READ_TIMEOUT_MS = 45000;

    private Base44Api() {
    }

    /** Outcome of one HTTP call. */
    static final class Result {
        final int code;
        final JSONObject body;
        final String error;

        Result(int code, JSONObject body, String error) {
            this.code = code;
            this.body = body;
            this.error = error;
        }

        boolean isSuccess() {
            return code >= 200 && code < 300;
        }

        /** The token was rejected — a fresh session is needed before retrying. */
        boolean isAuthFailure() {
            return code == 401 || code == 403;
        }

        /** No HTTP response at all (offline, DNS, timeout) — worth retrying later. */
        boolean isTransport() {
            return code == 0;
        }

        /**
         * A malformed request (e.g. missing text). Retrying can never succeed, so the
         * capture is dropped rather than retried forever.
         */
        boolean isPermanentBadRequest() {
            return code == 400;
        }

        /**
         * The server explicitly reported failure inside a 2xx. Nothing was created, so
         * re-sending is safe.
         */
        boolean isReportedFailure() {
            return isSuccess() && body != null && body.has("success") && !body.optBoolean("success", true);
        }

        /** True when the server recognised this capture_id and did not create anything new. */
        boolean isDuplicate() {
            return body != null && body.optBoolean("duplicate", false);
        }

        /** Tasks created by this capture. */
        JSONArray tasks() {
            if (body == null) {
                return new JSONArray();
            }
            JSONArray tasks = body.optJSONArray("tasks");
            return tasks != null ? tasks : new JSONArray();
        }

        /** Authoritative task count from the server, falling back to the array length. */
        int count() {
            if (body == null) {
                return 0;
            }
            return body.optInt("count", tasks().length());
        }
    }

    /** The device's IANA timezone, e.g. "America/Chicago". Optional to the server. */
    static String deviceTimezone() {
        try {
            String id = TimeZone.getDefault().getID();
            return (id == null || id.isEmpty()) ? null : id;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Hand one capture to the server. captureId is the durable queue item's UUID, sent so
     * base44 can dedupe retries once it supports that.
     */
    static Result submitCapture(Context context, String text, String captureId) {
        return submitCapture(context, text, captureId, 0L);
    }

    /**
     * saidAt: when the words were captured (the queue item's own time). A capture
     * delivered late (no signal, phone off) still counts "tomorrow" from when it
     * was said; the server ignores a time it can't trust.
     */
    static Result submitCapture(Context context, String text, String captureId, long saidAt) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("text", text);
            if (saidAt > 0L) {
                payload.put("said_at", saidAt);
            }
            String timezone = deviceTimezone();
            if (timezone != null) {
                payload.put("timezone", timezone);
            }
            if (captureId != null) {
                payload.put("capture_id", captureId);
            }
        } catch (Exception e) {
            return new Result(0, null, "could not build capture payload");
        }

        String serverUrl = Base44Session.getServerUrl(context);
        String appId = Base44Session.getAppId(context);
        if (serverUrl == null || appId == null) {
            return new Result(0, null, "no stored base44 session");
        }

        String url = serverUrl + "/api/apps/" + appId + "/functions/" + CAPTURE_FUNCTION;
        return post(context, url, payload);
    }

    /**
     * Hand a shared image (JPEG, base64) to the server to read into a sentence. The
     * response carries { text } — or { nothing_found: true } when the picture holds no
     * task (a selfie, a meme).
     */
    static Result readImage(Context context, String jpegBase64) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("image_base64", jpegBase64);
            payload.put("mime_type", "image/jpeg");
        } catch (Exception e) {
            return new Result(0, null, "could not build image payload");
        }

        String serverUrl = Base44Session.getServerUrl(context);
        String appId = Base44Session.getAppId(context);
        if (serverUrl == null || appId == null) {
            return new Result(0, null, "no stored base44 session");
        }

        String url = serverUrl + "/api/apps/" + appId + "/functions/" + READ_IMAGE_FUNCTION;
        return post(context, url, payload);
    }

    /** Applies a Later break on the server (cancelTaskNotifications, mode "later"). */
    static final String LATER_FUNCTION = "cancelTaskNotifications";

    /**
     * Later was tapped for this task: the server takes its smart nudges, planned
     * reminders and rhythm pings off for the break (LaterBreak). The response
     * carries { success, later_until }.
     */
    static Result reportLater(Context context, String taskId) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("taskId", taskId);
            payload.put("mode", "later");
            String timezone = deviceTimezone();
            if (timezone != null) {
                payload.put("timezone", timezone);
            }
        } catch (Exception e) {
            return new Result(0, null, "could not build later payload");
        }

        String serverUrl = Base44Session.getServerUrl(context);
        String appId = Base44Session.getAppId(context);
        if (serverUrl == null || appId == null) {
            return new Result(0, null, "no stored base44 session");
        }

        String url = serverUrl + "/api/apps/" + appId + "/functions/" + LATER_FUNCTION;
        return post(context, url, payload);
    }

    /**
     * The phone's other reports go through the same function as Later
     * (cancelTaskNotifications), by mode: "alarm_choice" (a choice made on an
     * alarm or a reminder), "pair" (do two alarms ring as one?) and "woke" (the
     * first unlock of the day, WakeWatch). readTimeoutMs keeps a check the
     * phone waits on short.
     */
    static Result phoneReport(Context context, JSONObject payload, int readTimeoutMs) {
        String serverUrl = Base44Session.getServerUrl(context);
        String appId = Base44Session.getAppId(context);
        if (serverUrl == null || appId == null) {
            return new Result(0, null, "no stored base44 session");
        }
        try {
            String timezone = deviceTimezone();
            if (timezone != null && !payload.has("timezone")) {
                payload.put("timezone", timezone);
            }
        } catch (Exception ignored) {
        }
        String url = serverUrl + "/api/apps/" + appId + "/functions/" + LATER_FUNCTION;
        return post(context, url, payload, readTimeoutMs);
    }

    /** Phone calendars imported with the app closed (CalendarSyncWorker). */
    static final String CALENDAR_FUNCTION = "syncGoogleCalendar";

    /**
     * Hands the phone's calendar rows, as CalendarBridge.readEvents reads them,
     * to the server's calendar import (source "device"), the same import the
     * app's Sync now uses. A first import sorts every event with AI and can take
     * minutes, so the wait for an answer is long.
     */
    static Result syncPhoneCalendars(Context context, JSONObject payload, int readTimeoutMs) {
        String serverUrl = Base44Session.getServerUrl(context);
        String appId = Base44Session.getAppId(context);
        if (serverUrl == null || appId == null) {
            return new Result(0, null, "no stored base44 session");
        }
        String url = serverUrl + "/api/apps/" + appId + "/functions/" + CALENDAR_FUNCTION;
        return post(context, url, payload, readTimeoutMs);
    }

    private static Result post(Context context, String spec, JSONObject body) {
        return post(context, spec, body, READ_TIMEOUT_MS);
    }

    private static Result post(Context context, String spec, JSONObject body, int readTimeoutMs) {
        String token = Base44Session.getToken(context);
        String appId = Base44Session.getAppId(context);
        if (token == null) {
            return new Result(0, null, "no stored access token");
        }

        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(spec).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(readTimeoutMs > 0 ? readTimeoutMs : READ_TIMEOUT_MS);
            connection.setRequestProperty("Authorization", "Bearer " + token);
            if (appId != null) {
                connection.setRequestProperty("X-App-Id", appId);
            }
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Accept", "application/json");
            connection.setDoOutput(true);

            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(payload.length);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(payload);
            }

            int code = connection.getResponseCode();
            String responseText = readStream(
                    code >= 400 ? connection.getErrorStream() : connection.getInputStream());

            Log.d(TAG, "Base44Api POST " + spec + " -> " + code);

            JSONObject object = null;
            if (responseText != null) {
                String trimmed = responseText.trim();
                if (trimmed.startsWith("{")) {
                    try {
                        object = new JSONObject(trimmed);
                    } catch (Exception parseError) {
                        Log.w(TAG, "Base44Api: unparseable JSON body");
                    }
                }
            }
            return new Result(code, object, code >= 400 ? responseText : null);

        } catch (Exception e) {
            // No HTTP status: offline, DNS failure, timeout. Retryable — and the reason the
            // capture_id matters, since the server may have created the task anyway.
            Log.w(TAG, "Base44Api POST transport failure: " + e.getMessage());
            return new Result(0, null, String.valueOf(e.getMessage()));
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static String readStream(InputStream stream) {
        if (stream == null) {
            return null;
        }
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader =
                     new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        } catch (Exception e) {
            Log.w(TAG, "Base44Api: failed reading response: " + e.getMessage());
        }
        return builder.toString();
    }
}
