package co.median.android.odxqpdy;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import android.widget.RemoteViews;

import org.json.JSONArray;

/**
 * "Today" home-screen widget: the tasks the web app last published, styled to match
 * the app — pastel gradient page, white task chips, pastel urgency pills.
 *
 * Deliberately light in both system themes. The app's own background comes from
 * Layout.jsx's getBackgroundClass(), which only goes dark for an explicit in-app
 * "dark" theme setting that native cannot see; following the SYSTEM theme instead
 * made the widget a dark card while the app beside it stayed pastel.
 */
public class TodayWidgetProvider extends AppWidgetProvider {

    private static final String TAG = "ADHDone";

    /** Extra set on the launch intent so the web app could deep-link later if wanted. */
    static final String EXTRA_FROM_WIDGET = "adhdone_from_widget";

    // PendingIntent request codes. These must not collide with the ones used elsewhere in
    // the app (4411/4412 QuickCapture, 4413/4414 CaptureNotifications), and each clickable
    // target needs its own: PendingIntent identity ignores extras, so two targets sharing a
    // request code would share — and overwrite — each other's path.
    private static final int RC_ROOT = 4415;
    private static final int RC_ADD = 4416;
    private static final int RC_ROW_BASE = 4420;

    /** In-app path the "+" button opens. */
    private static final String PATH_ADD_TASK = "/AddTask";

    private static final int[] ROW_IDS = {
            R.id.widget_row_0, R.id.widget_row_1, R.id.widget_row_2,
            R.id.widget_row_3, R.id.widget_row_4
    };
    private static final int[] ROW_TITLE_IDS = {
            R.id.widget_row_0_title, R.id.widget_row_1_title, R.id.widget_row_2_title,
            R.id.widget_row_3_title, R.id.widget_row_4_title
    };
    private static final int[] ROW_TIME_IDS = {
            R.id.widget_row_0_time, R.id.widget_row_1_time, R.id.widget_row_2_time,
            R.id.widget_row_3_time, R.id.widget_row_4_time
    };
    private static final int[] ROW_PILL_IDS = {
            R.id.widget_row_0_pill, R.id.widget_row_1_pill, R.id.widget_row_2_pill,
            R.id.widget_row_3_pill, R.id.widget_row_4_pill
    };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            manager.updateAppWidget(id, buildViews(context));
        }
        // Make sure the midnight rollover is armed as soon as a widget exists.
        WidgetRefreshWorker.scheduleNextMidnight(context);
    }

    @Override
    public void onEnabled(Context context) {
        super.onEnabled(context);
        WidgetRefreshWorker.scheduleNextMidnight(context);
    }

    @Override
    public void onDisabled(Context context) {
        // Last widget removed — stop the daily refresh.
        WidgetRefreshWorker.cancel(context);
        super.onDisabled(context);
    }

    /** Redraw every placed instance of this widget. Safe to call from anywhere. */
    static void refreshAll(Context context) {
        try {
            Context appContext = context.getApplicationContext();
            AppWidgetManager manager = AppWidgetManager.getInstance(appContext);
            int[] ids = manager.getAppWidgetIds(
                    new android.content.ComponentName(appContext, TodayWidgetProvider.class));
            if (ids == null || ids.length == 0) {
                return;
            }
            RemoteViews views = buildViews(appContext);
            for (int id : ids) {
                manager.updateAppWidget(id, views);
            }
            Log.d(TAG, "TodayWidgetProvider: refreshed " + ids.length + " widget(s)");
        } catch (Exception e) {
            Log.w(TAG, "TodayWidgetProvider.refreshAll failed: " + e.getMessage());
        }
    }

    private static RemoteViews buildViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today);

        // Background of the widget just opens the app, wherever it last was.
        views.setOnClickPendingIntent(R.id.widget_root, openApp(context, RC_ROOT, null));
        // "+" opens a small native "type a task" box (WidgetCaptureActivity), not the
        // app: the text goes down the same silent queue as a shared sentence.
        views.setOnClickPendingIntent(R.id.widget_add, openCapture(context));

        // Silence ADHDone for an hour right from the home screen. While silenced the
        // header says until when, and the same button turns the sound back on.
        boolean silenced = ReminderPause.isPaused(context);
        views.setTextViewText(R.id.widget_silence, silenced ? "\uD83D\uDD14 Sound on" : "\uD83D\uDD15 Silence 1 hr");
        views.setOnClickPendingIntent(R.id.widget_silence, silenced
                ? ReminderPause.actionIntent(context, ReminderPause.RC_WIDGET, ReminderPause.ACTION_UNSILENCE, 0, false)
                : ReminderPause.actionIntent(context, ReminderPause.RC_WIDGET, ReminderPause.ACTION_SILENCE, 1, false));
        views.setTextViewText(R.id.widget_header, silenced
                ? "Silenced till " + ReminderPause.untilLabel(context)
                : context.getString(R.string.widget_title));

        JSONArray tasks = WidgetData.rawTasks(context);
        boolean stale = WidgetData.isStale(context);
        boolean neverLoaded = !WidgetData.hasSnapshot(context);

        int shown = 0;
        if (!stale) {
            for (int i = 0; i < tasks.length() && shown < WidgetData.MAX_ROWS; i++) {
                WidgetData.Task task = WidgetData.taskAt(tasks, i);
                if (task == null) {
                    continue;
                }
                views.setTextViewText(ROW_TITLE_IDS[shown], task.title);
                views.setTextViewText(ROW_TIME_IDS[shown], task.time);
                views.setViewVisibility(ROW_TIME_IDS[shown],
                        task.time.isEmpty() ? android.view.View.GONE : android.view.View.VISIBLE);
                bindUrgencyPill(context, views, ROW_PILL_IDS[shown], task.urgency);
                views.setViewVisibility(ROW_IDS[shown], android.view.View.VISIBLE);
                // Rows the web app gave an id for deep-link to that task; the rest fall back
                // to plainly opening the app, which is better than a dead row.
                String path = task.id.isEmpty()
                        ? null
                        : "/TaskNotification?taskId=" + Uri.encode(task.id);
                views.setOnClickPendingIntent(ROW_IDS[shown],
                        openApp(context, RC_ROW_BASE + shown, path));
                shown++;
            }
        }

        // Hide any unused rows (RemoteViews are recycled between updates).
        for (int i = shown; i < WidgetData.MAX_ROWS; i++) {
            views.setViewVisibility(ROW_IDS[i], android.view.View.GONE);
        }

        // Header count + overflow.
        int total = countRenderable(tasks);
        if (!stale && total > 0) {
            views.setTextViewText(R.id.widget_count, String.valueOf(total));
            views.setViewVisibility(R.id.widget_count, android.view.View.VISIBLE);
        } else {
            views.setViewVisibility(R.id.widget_count, android.view.View.GONE);
        }

        int overflow = stale ? 0 : total - shown;
        if (overflow > 0) {
            views.setTextViewText(R.id.widget_more, "+" + overflow + " more");
            views.setViewVisibility(R.id.widget_more, android.view.View.VISIBLE);
        } else {
            views.setViewVisibility(R.id.widget_more, android.view.View.GONE);
        }

        // Optional summary line from the web app. Suppressed when the snapshot is stale or
        // absent, since it would describe a day that has already rolled over.
        String heading = WidgetData.heading(context);
        boolean hasHeading = !neverLoaded && !stale && !heading.isEmpty();
        if (hasHeading) {
            views.setTextViewText(R.id.widget_heading, heading);
            views.setViewVisibility(R.id.widget_heading, android.view.View.VISIBLE);
        } else {
            views.setViewVisibility(R.id.widget_heading, android.view.View.GONE);
        }

        // Empty / stale / never-loaded messaging. The two empty states are deliberately
        // distinct: never synced means the web app has not published yet, whereas synced
        // with zero tasks is a genuinely clear day — and when the web app described that
        // day in the heading, the heading alone says it and no placeholder is needed.
        String emptyText = null;
        if (neverLoaded) {
            emptyText = context.getString(R.string.widget_needs_open);
        } else if (stale) {
            emptyText = context.getString(R.string.widget_stale);
        } else if (shown == 0 && !hasHeading) {
            emptyText = context.getString(R.string.widget_empty);
        }
        if (emptyText != null) {
            views.setTextViewText(R.id.widget_empty, emptyText);
            views.setViewVisibility(R.id.widget_empty, android.view.View.VISIBLE);
        } else {
            views.setViewVisibility(R.id.widget_empty, android.view.View.GONE);
        }

        return views;
    }

    /**
     * PendingIntent that brings the existing WebView forward (MainActivity is singleTask,
     * so this arrives via onNewIntent rather than reloading the page) and, when a path is
     * given, asks WidgetBridge to navigate there.
     */
    private static PendingIntent openApp(Context context, int requestCode, String path) {
        Intent open = new Intent(context, MainActivity.class)
                .setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .putExtra(EXTRA_FROM_WIDGET, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (path != null && !path.isEmpty()) {
            open.putExtra(WidgetBridge.EXTRA_WIDGET_PATH, path);
        }
        return PendingIntent.getActivity(context, requestCode, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent openCapture(Context context) {
        Intent capture = new Intent(context, WidgetCaptureActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return PendingIntent.getActivity(context, RC_ADD, capture,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static int countRenderable(JSONArray tasks) {
        int n = 0;
        for (int i = 0; i < tasks.length(); i++) {
            if (WidgetData.taskAt(tasks, i) != null) {
                n++;
            }
        }
        return n;
    }

    /**
     * Fill in one urgency pill. Labels match the app's TaskCard, which abbreviates
     * "medium" to "med" and otherwise prints the urgency verbatim.
     *
     * The background is swapped by resource rather than tinted, because RemoteViews
     * can set a background resource but cannot recolour a shape drawable; res/raw/keep.xml
     * keeps the four pill drawables, whose only references are the R constants below.
     */
    private static void bindUrgencyPill(Context context, RemoteViews views, int viewId, String urgency) {
        int background;
        int textColor;
        String label;
        if ("urgent".equals(urgency)) {
            background = R.drawable.widget_pill_urgent;
            textColor = R.color.widget_pill_urgent_text;
            label = "urgent";
        } else if ("high".equals(urgency)) {
            background = R.drawable.widget_pill_high;
            textColor = R.color.widget_pill_high_text;
            label = "high";
        } else if ("low".equals(urgency)) {
            background = R.drawable.widget_pill_low;
            textColor = R.color.widget_pill_low_text;
            label = "low";
        } else {
            background = R.drawable.widget_pill_medium;
            textColor = R.color.widget_pill_medium_text;
            label = "med";
        }
        views.setTextViewText(viewId, label);
        views.setInt(viewId, "setBackgroundResource", background);
        views.setTextColor(viewId, androidx.core.content.ContextCompat.getColor(context, textColor));
    }
}
