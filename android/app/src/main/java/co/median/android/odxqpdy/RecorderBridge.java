package co.median.android.odxqpdy;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * RecorderBridge — the web app's handle on the note-taking recorder (RecorderService).
 *
 *   const R = window.Capacitor.Plugins.RecorderBridge
 *   await R.start({ title?, maxMinutes? })   -> { ok, sessionId, error? }
 *   await R.pause() / R.resume()             -> { ok, session }
 *   await R.stop()                           -> { ok, session }
 *   await R.status()                         -> { recording, session }   (the one in progress, if any)
 *   await R.listSessions()                   -> { sessions: [...] }      (newest first, everything on the phone)
 *   await R.readPart({ sessionId, index })   -> { base64, mimeType: "audio/mp4", bytes, fileName }
 *                                               (finished parts only; the one being recorded is refused)
 *   await R.deleteSession({ sessionId })     -> { ok }
 *   R.addListener("recorder", e => ...)      // e = { type, session, error? }
 *
 * start() asks for the microphone the first time (Android's own prompt; the standard
 * Capacitor alias is "microphone", so checkPermissions / requestPermissions work too)
 * and answers only once the microphone has actually started, or failed to.
 * Event types: started, paused, resumed, part (a ~10 minute part finished and can be
 * read), stopped (with error "time_limit", "recorder_error" or "service_ended" when it
 * stopped on its own), error (it never started: "mic_unavailable", or "service_blocked"
 * when Android refused because the app wasn't on screen).
 *
 * A session's shape is described in RecorderStore. Audio never leaves the phone from
 * here: the web app reads each part and sends it for transcription itself, then calls
 * deleteSession. The web app's presence check (`!!window.Capacitor?.Plugins?.RecorderBridge`)
 * is what "this build can record notes" means; older builds don't have it.
 */
@CapacitorPlugin(
        name = "RecorderBridge",
        permissions = {
                @Permission(strings = {Manifest.permission.RECORD_AUDIO}, alias = "microphone")
        }
)
public class RecorderBridge extends Plugin implements RecorderService.Listener {

    private static final String TAG = "ADHDone";
    private static final long START_TIMEOUT_MS = 8_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    // start() calls waiting for the microphone to actually start, by session id.
    private final Map<String, PluginCall> pendingStarts = new HashMap<>();

    @Override
    public void load() {
        super.load();
        RecorderService.listener = this;
        // Anything cut off by a crash or restart since last time is marked as such.
        RecorderStore.settleOrphans(getContext(), RecorderService.activeId);
    }

    @Override
    protected void handleOnDestroy() {
        if (RecorderService.listener == this) RecorderService.listener = null;
        super.handleOnDestroy();
    }

    private boolean hasMic() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
    }

    // ── Recording ────────────────────────────────────────────────────────────

    @PluginMethod
    public void start(PluginCall call) {
        if (!hasMic()) {
            requestPermissionForAlias("microphone", call, "micPermissionAnswered");
            return;
        }
        beginRecording(call);
    }

    @PermissionCallback
    private void micPermissionAnswered(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("error", "mic_permission_denied");
            call.resolve(ret);
            return;
        }
        beginRecording(call);
    }

    private void beginRecording(PluginCall call) {
        String active = RecorderService.activeId;
        if (active != null) {
            // Already recording; Record twice must not start a second recording.
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("sessionId", active);
            ret.put("alreadyRecording", true);
            call.resolve(ret);
            return;
        }
        String id = "rec" + System.currentTimeMillis();
        String title = call.getString("title", "");
        int maxMinutes = call.getInt("maxMinutes", 0);
        call.setKeepAlive(true);
        pendingStarts.put(id, call);
        handler.postDelayed(() -> {
            PluginCall waiting = pendingStarts.remove(id);
            if (waiting == null) return;
            JSObject ret = new JSObject();
            boolean running = id.equals(RecorderService.activeId);
            ret.put("ok", running);
            ret.put("sessionId", id);
            if (!running) ret.put("error", "no_response");
            waiting.resolve(ret);
            waiting.setKeepAlive(false);
        }, START_TIMEOUT_MS);
        try {
            RecorderService.start(getContext(), id, title, maxMinutes);
        } catch (Exception e) {
            Log.w(TAG, "Recorder: could not start the recording service", e);
            PluginCall waiting = pendingStarts.remove(id);
            if (waiting != null) {
                JSObject ret = new JSObject();
                ret.put("ok", false);
                ret.put("error", "service_blocked");
                waiting.resolve(ret);
                waiting.setKeepAlive(false);
            }
        }
    }

    @PluginMethod
    public void pause(PluginCall call) {
        control(call, RecorderService.ACTION_PAUSE);
    }

    @PluginMethod
    public void resume(PluginCall call) {
        control(call, RecorderService.ACTION_RESUME);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        control(call, RecorderService.ACTION_STOP);
    }

    // The service does the work; the answer is the session as saved a moment later.
    private void control(PluginCall call, String action) {
        String id = RecorderService.activeId;
        if (id == null) {
            JSObject ret = new JSObject();
            ret.put("ok", false);
            ret.put("error", "not_recording");
            call.resolve(ret);
            return;
        }
        RecorderService.send(getContext(), action);
        handler.postDelayed(() -> {
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("session", toJs(RecorderStore.read(getContext(), id)));
            call.resolve(ret);
        }, 400);
    }

    @PluginMethod
    public void status(PluginCall call) {
        String id = RecorderService.activeId;
        JSObject ret = new JSObject();
        ret.put("recording", id != null);
        ret.put("session", id != null ? toJs(RecorderStore.read(getContext(), id)) : null);
        call.resolve(ret);
    }

    // ── Recordings on the phone ──────────────────────────────────────────────

    @PluginMethod
    public void listSessions(PluginCall call) {
        RecorderStore.settleOrphans(getContext(), RecorderService.activeId);
        List<JSONObject> all = RecorderStore.all(getContext());
        JSArray list = new JSArray();
        for (JSONObject s : all) list.put(toJs(s));
        JSObject ret = new JSObject();
        ret.put("sessions", list);
        call.resolve(ret);
    }

    @PluginMethod
    public void readPart(PluginCall call) {
        String id = RecorderStore.safe(call.getString("sessionId", ""));
        Integer index = call.getInt("index");
        if (id.isEmpty() || index == null) {
            call.reject("sessionId and index are required");
            return;
        }
        File f = RecorderStore.partFile(getContext(), id, index);
        if (!f.exists()) {
            call.reject("No such part");
            return;
        }
        // The part being written right now isn't a readable file until it's finished.
        if (id.equals(RecorderService.activeId)) {
            JSONObject s = RecorderStore.read(getContext(), id);
            org.json.JSONArray parts = s != null ? s.optJSONArray("parts") : null;
            if (parts != null) {
                for (int i = 0; i < parts.length(); i++) {
                    JSONObject p = parts.optJSONObject(i);
                    if (p != null && p.optInt("index", -1) == index && p.isNull("endMs")) {
                        call.reject("That part is still being recorded");
                        return;
                    }
                }
            }
        }
        // Reading happens off the main thread: a part is about 5 MB.
        getBridge().execute(() -> {
            try (FileInputStream in = new FileInputStream(f)) {
                byte[] buf = new byte[(int) f.length()];
                int off = 0;
                while (off < buf.length) {
                    int n = in.read(buf, off, buf.length - off);
                    if (n < 0) break;
                    off += n;
                }
                JSObject ret = new JSObject();
                ret.put("base64", Base64.encodeToString(buf, 0, off, Base64.NO_WRAP));
                ret.put("mimeType", "audio/mp4");
                ret.put("fileName", f.getName());
                ret.put("bytes", off);
                call.resolve(ret);
            } catch (Exception e) {
                Log.w(TAG, "Recorder: could not read " + f, e);
                call.reject("Could not read that part");
            }
        });
    }

    @PluginMethod
    public void deleteSession(PluginCall call) {
        String id = RecorderStore.safe(call.getString("sessionId", ""));
        JSObject ret = new JSObject();
        if (id.isEmpty() || id.equals(RecorderService.activeId)) {
            // Never delete the recording that's still going.
            ret.put("ok", false);
            call.resolve(ret);
            return;
        }
        ret.put("ok", RecorderStore.delete(getContext(), id));
        call.resolve(ret);
    }

    // ── Events from the service ──────────────────────────────────────────────

    @Override
    public void onRecorderEvent(String type, JSONObject session, String error) {
        handler.post(() -> {
            String id = session != null ? session.optString("id") : RecorderService.activeId;
            if (id != null && ("started".equals(type) || "error".equals(type))) {
                PluginCall waiting = pendingStarts.remove(id);
                if (waiting != null) {
                    JSObject ret = new JSObject();
                    ret.put("ok", "started".equals(type));
                    ret.put("sessionId", id);
                    if (error != null) ret.put("error", error);
                    waiting.resolve(ret);
                    waiting.setKeepAlive(false);
                }
            }
            JSObject payload = new JSObject();
            payload.put("type", type);
            payload.put("session", toJs(session));
            if (error != null) payload.put("error", error);
            notifyListeners("recorder", payload, true);
        });
    }

    private static JSObject toJs(JSONObject s) {
        if (s == null) return null;
        try {
            return JSObject.fromJSONObject(s);
        } catch (Exception e) {
            return null;
        }
    }
}
