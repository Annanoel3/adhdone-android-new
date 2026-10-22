package co.median.android.odxqpdy;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import org.json.JSONArray;
import org.json.JSONException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * CalendarBridge — read-only access to every calendar the phone's own calendar
 * app knows about (Samsung Calendar, Outlook, iCloud, Google, local...), through
 * Android's Calendar Provider. Nothing is written, ever.
 *
 * The web app asks for the READ_CALENDAR permission with the standard Capacitor
 * calls (requestPermissions / checkPermissions, alias "calendar"), lets the user
 * tick the calendars they want, then pulls upcoming events and sends them
 * through the same import pipeline Google Calendar uses:
 *
 *   CalendarBridge.listCalendars()                 -> { granted, calendars: [...] }
 *   CalendarBridge.listEvents({ calendarIds, days }) -> { granted, events: [...] }
 *   CalendarBridge.setSyncCalendars({ calendarIds })  -> { watching }
 *
 * setSyncCalendars hands the person's ticked calendars to CalendarSyncWorker,
 * which watches them and imports changes with the app closed (build 43 on).
 *
 * listEvents walks the Instances table for the window (which expands recurring
 * series into real occurrences), then returns each underlying event ONCE: single
 * events as themselves, a recurring series as its master row (with RRULE and
 * the time of its next occurrence in the window), and an edited occurrence as
 * its own exception row (originalId / originalInstanceTime set). Times are epoch
 * milliseconds; all-day events use UTC midnight, as the provider stores them.
 */
@CapacitorPlugin(
        name = "CalendarBridge",
        permissions = {
                @Permission(strings = {Manifest.permission.READ_CALENDAR}, alias = "calendar")
        }
)
public class CalendarBridge extends Plugin {

    private static final String TAG = "ADHDone";
    private static final int DEFAULT_DAYS = 365;
    private static final int MAX_DAYS = 730;
    private static final int MAX_EVENTS = 2500;
    private static final int ID_CHUNK = 200;

    private boolean hasPermission() {
        return hasPermission(getContext());
    }

    static boolean hasPermission(Context ctx) {
        return ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CALENDAR)
                == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void listCalendars(PluginCall call) {
        JSObject ret = new JSObject();
        JSArray calendars = new JSArray();
        if (!hasPermission()) {
            ret.put("granted", false);
            ret.put("calendars", calendars);
            call.resolve(ret);
            return;
        }
        String[] projection = {
                CalendarContract.Calendars._ID,
                CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
                CalendarContract.Calendars.ACCOUNT_NAME,
                CalendarContract.Calendars.ACCOUNT_TYPE,
                CalendarContract.Calendars.CALENDAR_COLOR,
                CalendarContract.Calendars.VISIBLE,
                CalendarContract.Calendars.IS_PRIMARY,
                CalendarContract.Calendars.OWNER_ACCOUNT,
        };
        try (Cursor c = getContext().getContentResolver().query(
                CalendarContract.Calendars.CONTENT_URI, projection, null, null,
                CalendarContract.Calendars.ACCOUNT_NAME + " ASC, " + CalendarContract.Calendars.CALENDAR_DISPLAY_NAME + " ASC")) {
            while (c != null && c.moveToNext()) {
                JSObject cal = new JSObject();
                cal.put("id", String.valueOf(c.getLong(0)));
                cal.put("name", nz(c.getString(1)));
                cal.put("account", nz(c.getString(2)));
                cal.put("accountType", nz(c.getString(3)));
                cal.put("color", colorHex(c.isNull(4) ? 0 : c.getInt(4)));
                cal.put("visible", c.isNull(5) || c.getInt(5) != 0);
                cal.put("isPrimary", !c.isNull(6) && c.getInt(6) != 0);
                cal.put("owner", nz(c.getString(7)));
                calendars.put(cal);
            }
        } catch (Exception e) {
            Log.e(TAG, "CalendarBridge.listCalendars failed", e);
            call.reject("listCalendars failed: " + e.getMessage());
            return;
        }
        ret.put("granted", true);
        ret.put("calendars", calendars);
        call.resolve(ret);
    }

    @PluginMethod
    public void listEvents(PluginCall call) {
        JSObject ret = new JSObject();
        JSArray events = new JSArray();
        if (!hasPermission()) {
            ret.put("granted", false);
            ret.put("events", events);
            call.resolve(ret);
            return;
        }
        List<String> calendarIds = new ArrayList<>();
        JSArray wanted = call.getArray("calendarIds");
        if (wanted != null) {
            for (int i = 0; i < wanted.length(); i++) {
                try {
                    String id = String.valueOf(wanted.get(i)).trim();
                    if (!id.isEmpty() && id.matches("\\d+")) {
                        calendarIds.add(id);
                    }
                } catch (JSONException ignored) {
                }
            }
        }
        if (calendarIds.isEmpty()) {
            ret.put("granted", true);
            ret.put("events", events);
            call.resolve(ret);
            return;
        }
        int days = call.getInt("days", DEFAULT_DAYS);
        if (days < 1) {
            days = 1;
        }
        if (days > MAX_DAYS) {
            days = MAX_DAYS;
        }
        try {
            readEvents(getContext(), calendarIds, days, events);
        } catch (Exception e) {
            Log.e(TAG, "CalendarBridge.listEvents failed", e);
            call.reject("listEvents failed: " + e.getMessage());
            return;
        }
        ret.put("granted", true);
        ret.put("events", events);
        call.resolve(ret);
    }

    /**
     * Which of the phone's calendars to watch and import with the app closed
     * (CalendarSyncWorker). The app sends the person's ticked calendars on
     * every open and after every tick; an empty list stops the watching.
     */
    @PluginMethod
    public void setSyncCalendars(PluginCall call) {
        List<String> ids = new ArrayList<>();
        JSArray wanted = call.getArray("calendarIds");
        if (wanted != null) {
            for (int i = 0; i < wanted.length(); i++) {
                try {
                    String id = String.valueOf(wanted.get(i)).trim();
                    if (!id.isEmpty() && id.matches("\\d+") && !ids.contains(id)) {
                        ids.add(id);
                    }
                } catch (JSONException ignored) {
                }
            }
        }
        CalendarSyncWorker.setCalendars(getContext(), ids);
        JSObject ret = new JSObject();
        ret.put("watching", !ids.isEmpty() && hasPermission());
        call.resolve(ret);
    }

    /**
     * The events of the given calendars over the next `days` days, soonest
     * first, one row per underlying event (see listEvents above). Shared by
     * listEvents (the app's own read) and CalendarSyncWorker (the background
     * read, app closed). The caller checks the permission first.
     */
    static void readEvents(Context ctx, List<String> calendarIds, int days, JSONArray out) throws Exception {
        if (days < 1) {
            days = 1;
        }
        if (days > MAX_DAYS) {
            days = MAX_DAYS;
        }
        long now = System.currentTimeMillis();
        long until = now + days * 86_400_000L;

        ContentResolver resolver = ctx.getContentResolver();

        // 1. Every occurrence in the window, earliest first. Remember the
        //    first occurrence per event so a recurring series can report
        //    when it next happens.
        Map<Long, long[]> firstInstance = new HashMap<>();
        List<Long> order = new ArrayList<>();
        Uri.Builder b = CalendarContract.Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(b, now);
        ContentUris.appendId(b, until);
        String[] iproj = {
                CalendarContract.Instances.EVENT_ID,
                CalendarContract.Instances.BEGIN,
                CalendarContract.Instances.END,
        };
        String isel = CalendarContract.Instances.CALENDAR_ID + " IN (" + placeholders(calendarIds.size()) + ")";
        try (Cursor c = resolver.query(b.build(), iproj, isel, calendarIds.toArray(new String[0]),
                CalendarContract.Instances.BEGIN + " ASC")) {
            while (c != null && c.moveToNext()) {
                long eventId = c.getLong(0);
                if (!firstInstance.containsKey(eventId)) {
                    firstInstance.put(eventId, new long[]{c.getLong(1), c.getLong(2)});
                    order.add(eventId);
                    if (order.size() >= MAX_EVENTS) {
                        break;
                    }
                }
            }
        }

        // 2. The underlying event rows, in chunks (SQLite caps bound variables).
        String[] eproj = {
                CalendarContract.Events._ID,
                CalendarContract.Events.CALENDAR_ID,
                CalendarContract.Events.TITLE,
                CalendarContract.Events.DESCRIPTION,
                CalendarContract.Events.EVENT_LOCATION,
                CalendarContract.Events.ALL_DAY,
                CalendarContract.Events.DTSTART,
                CalendarContract.Events.DTEND,
                CalendarContract.Events.DURATION,
                CalendarContract.Events.RRULE,
                CalendarContract.Events.EVENT_TIMEZONE,
                CalendarContract.Events.STATUS,
                CalendarContract.Events.ORIGINAL_ID,
                CalendarContract.Events.ORIGINAL_INSTANCE_TIME,
                CalendarContract.Events.ORGANIZER,
                CalendarContract.Events.DELETED,
                // The provider's id for this event on its server — for a Google
                // account that is Google's own event id, which is what the app's
                // Google Calendar import is keyed by. Lets the backend recognise
                // an event it already imported from Google and skip it.
                CalendarContract.Events._SYNC_ID,
        };
        Map<Long, JSObject> rows = new HashMap<>();
        for (int start = 0; start < order.size(); start += ID_CHUNK) {
            List<Long> chunk = order.subList(start, Math.min(order.size(), start + ID_CHUNK));
            String[] args = new String[chunk.size()];
            for (int i = 0; i < chunk.size(); i++) {
                args[i] = String.valueOf(chunk.get(i));
            }
            String esel = CalendarContract.Events._ID + " IN (" + placeholders(chunk.size()) + ")";
            try (Cursor c = resolver.query(CalendarContract.Events.CONTENT_URI, eproj, esel, args, null)) {
                while (c != null && c.moveToNext()) {
                    if (!c.isNull(15) && c.getInt(15) != 0) {
                        continue; // deleted, waiting for the sync adapter to purge it
                    }
                    if (!c.isNull(11) && c.getInt(11) == CalendarContract.Events.STATUS_CANCELED) {
                        continue;
                    }
                    long id = c.getLong(0);
                    JSObject e = new JSObject();
                    e.put("id", String.valueOf(id));
                    e.put("calendarId", String.valueOf(c.getLong(1)));
                    e.put("title", nz(c.getString(2)));
                    e.put("description", nz(c.getString(3)));
                    e.put("location", nz(c.getString(4)));
                    e.put("allDay", !c.isNull(5) && c.getInt(5) != 0);
                    e.put("dtstart", c.isNull(6) ? 0L : c.getLong(6));
                    e.put("dtend", c.isNull(7) ? 0L : c.getLong(7));
                    e.put("duration", nz(c.getString(8)));
                    e.put("rrule", nz(c.getString(9)));
                    e.put("timezone", nz(c.getString(10)));
                    e.put("originalId", c.isNull(12) ? "" : String.valueOf(c.getLong(12)));
                    e.put("originalInstanceTime", c.isNull(13) ? 0L : c.getLong(13));
                    e.put("organizer", nz(c.getString(14)));
                    e.put("syncId", c.isNull(16) ? "" : nz(c.getString(16)));
                    long[] first = firstInstance.get(id);
                    e.put("nextBegin", first != null ? first[0] : 0L);
                    e.put("nextEnd", first != null ? first[1] : 0L);
                    rows.put(id, e);
                }
            }
        }

        // Keep the "soonest first" order from the instance walk.
        for (Long id : order) {
            JSObject e = rows.get(id);
            if (e != null) {
                out.put(e);
            }
        }
    }

    private static String placeholders(int n) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) {
            sb.append(i == 0 ? "?" : ",?");
        }
        return sb.toString();
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static String colorHex(int argb) {
        return String.format("#%06X", argb & 0xFFFFFF);
    }
}
