package co.median.android.odxqpdy;

import android.content.Context;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

/**
 * WidgetBridge — lets the web app publish today's tasks to the home-screen widget.
 *
 * Called from the web app via:
 *   window.Capacitor.Plugins.WidgetBridge.updateTasks({ tasks: [...], generatedFor: "YYYY-MM-DD" })
 *
 * The web app does the filtering (it owns isTodayTask in
 * src/components/utils/todayTasks.js); native only stores and renders.
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridge extends Plugin {

    private static final String TAG = "ADHDone";

    /** Event carrying the in-app path a widget tap should navigate to. */
    private static final String EVENT_WIDGET_OPEN = "widgetOpen";

    /** Intent extra MainActivity forwards from a widget PendingIntent. */
    static final String EXTRA_WIDGET_PATH = "adhdone_widget_path";

    /**
     * Path from a tap that arrived before the web app had a listener attached (cold start).
     * Collected once by getPendingWidgetOpen().
     */
    private static String pendingWidgetPath = null;

    /** The currently loaded plugin instance, used to fire the widgetOpen event. */
    private static WidgetBridge instance = null;

    @Override
    public void load() {
        super.load();
        instance = this;
        Log.d(TAG, "WidgetBridge loaded");
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
        super.handleOnDestroy();
    }

    /**
     * Native-only entry point for a widget tap. Called by MainActivity for both the
     * cold-start intent and onNewIntent.
     *
     * Delivery is exactly-once: when the web app already has a widgetOpen listener the
     * event is emitted and nothing is buffered; otherwise — the cold-start case, where the
     * plugin is loaded but the React listener has not mounted yet — the path is buffered
     * for getPendingWidgetOpen() instead. That avoids a stale buffer replaying a navigation
     * the user already got.
     */
    public static void deliverPath(String path) {
        if (path == null) {
            return;
        }
        String trimmed = path.trim();
        // The web app rejects anything that is not app-relative.
        if (!trimmed.startsWith("/")) {
            Log.w(TAG, "WidgetBridge.deliverPath: ignoring non-relative path \"" + trimmed + "\"");
            return;
        }

        WidgetBridge plugin = instance;
        if (plugin != null && plugin.hasListeners(EVENT_WIDGET_OPEN)) {
            JSObject payload = new JSObject();
            payload.put("path", trimmed);
            plugin.notifyListeners(EVENT_WIDGET_OPEN, payload);
            // Drop anything buffered by an earlier tap that was never collected, so it
            // cannot replay a navigation later.
            pendingWidgetPath = null;
            Log.d(TAG, "WidgetBridge: emitted widgetOpen " + trimmed);
        } else {
            pendingWidgetPath = trimmed;
            Log.d(TAG, "WidgetBridge: buffered widget path " + trimmed + " for cold start");
        }
    }

    /**
     * Path from a tap that happened while the app was closed. Returns { path } once and
     * clears it; resolves with no path when nothing is pending.
     */
    @PluginMethod
    public void getPendingWidgetOpen(PluginCall call) {
        String path = pendingWidgetPath;
        pendingWidgetPath = null;

        JSObject result = new JSObject();
        if (path != null && !path.isEmpty()) {
            result.put("path", path);
        }
        call.resolve(result);
    }

    /**
     * Publish today's tasks.
     *
     * options.tasks       — array of { title, time?, urgency?, classification? }
     * options.generatedFor — local date "YYYY-MM-DD" the list was built for (optional
     *                        but recommended; without it the snapshot never goes stale)
     *
     * Resolves { ok: true, count: <stored>, widgets: <placed instances> }.
     */
    @PluginMethod
    public void updateTasks(PluginCall call) {
        Context context = getContext();
        try {
            JSONArray tasks = call.getArray("tasks");
            if (tasks == null) {
                tasks = new JSONArray();
            }
            String generatedFor = call.getString("generatedFor", "");
            // Optional summary line rendered above the rows, e.g. "No tasks due today."
            String heading = call.getString("heading", "");

            WidgetData.save(context, tasks, generatedFor, heading);
            TodayWidgetProvider.refreshAll(context);
            WidgetRefreshWorker.scheduleNextMidnight(context);

            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("count", tasks.length());
            result.put("widgets", placedWidgetCount(context));
            Log.d(TAG, "WidgetBridge.updateTasks: " + tasks.length() + " task(s) for " + generatedFor);
            call.resolve(result);
        } catch (Exception e) {
            Log.w(TAG, "WidgetBridge.updateTasks failed: " + e.getMessage());
            call.reject("Could not update the widget: " + e.getMessage(), "widget-update-failed");
        }
    }

    /** Drop the stored snapshot (e.g. on logout) and redraw. */
    @PluginMethod
    public void clearTasks(PluginCall call) {
        Context context = getContext();
        try {
            WidgetData.clear(context);
            TodayWidgetProvider.refreshAll(context);
            JSObject result = new JSObject();
            result.put("ok", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not clear the widget: " + e.getMessage(), "widget-clear-failed");
        }
    }

    /**
     * How many widget instances the user has actually placed, so the web app can skip
     * the work entirely when there are none. Resolves { widgets: N }.
     */
    @PluginMethod
    public void getWidgetCount(PluginCall call) {
        JSObject result = new JSObject();
        result.put("widgets", placedWidgetCount(getContext()));
        call.resolve(result);
    }

    private int placedWidgetCount(Context context) {
        try {
            android.appwidget.AppWidgetManager manager =
                    android.appwidget.AppWidgetManager.getInstance(context.getApplicationContext());
            int[] ids = manager.getAppWidgetIds(new android.content.ComponentName(
                    context.getApplicationContext(), TodayWidgetProvider.class));
            return ids != null ? ids.length : 0;
        } catch (Exception e) {
            return 0;
        }
    }
}
