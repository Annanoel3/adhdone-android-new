package co.median.android.odxqpdy;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Activity;
import android.app.Notification;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;

import androidx.test.core.app.ApplicationProvider;

import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowLooper;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * What the alarm screen DOES, with no phone: which buttons each kind of alarm
 * has, what each one sends, that Later needs the full hold, and the off
 * switch. Copied into the build COPY by setup.py; never part of the app.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = android.app.Application.class, shadows = { AlarmShotTest.QuietKeyguard.class })
public class AlarmBehaviorTest {

    private Context ctx;

    @Before
    public void setUp() {
        RuntimeEnvironment.setQualifiers("w360dp-h760dp-xhdpi");
        ctx = ApplicationProvider.getApplicationContext();
        ctx.getSharedPreferences("adhdone_alarm_screen", 0).edit().clear().commit();
        AlarmTheme.clear(ctx);
    }

    private static AlarmStore.Entry task(String id) {
        AlarmStore.Entry e = new AlarmStore.Entry();
        e.id = id;
        e.taskId = "t1";
        e.title = "Water the plants";
        e.heading = "Water the plants";
        e.body = "Now's a good time.";
        e.at = System.currentTimeMillis() - 10 * 60 * 1000L;
        return e;
    }

    private AlarmActivity open(AlarmStore.Entry e, boolean markDone) {
        AlarmStore.put(ctx, e);
        Intent i = new Intent(ctx, AlarmActivity.class).putExtra(AlarmScheduler.EXTRA_ALARM_ID, e.id);
        if (markDone) {
            i.putExtra(AlarmActivity.EXTRA_MARK_DONE, true);
        }
        AlarmActivity a = Robolectric.buildActivity(AlarmActivity.class, i).setup().get();
        ShadowLooper.idleMainLooper(2, TimeUnit.SECONDS);
        return a;
    }

    private static List<String> sentToService(Activity a) {
        List<String> out = new ArrayList<>();
        Intent i;
        while ((i = shadowOf(a).getNextStartedService()) != null) {
            out.add(String.valueOf(i.getAction()));
        }
        return out;
    }

    private static String openedPath(Activity a) {
        Intent i = shadowOf(a).getNextStartedActivity();
        return i == null ? null : i.getStringExtra(WidgetBridge.EXTRA_WIDGET_PATH);
    }

    private static boolean shown(Activity a, int id) {
        View v = a.findViewById(id);
        return v != null && v.getVisibility() == View.VISIBLE;
    }

    private static void touch(View v, int action) {
        long t = SystemClock.uptimeMillis();
        v.dispatchTouchEvent(MotionEvent.obtain(t, t, action, 60f, 30f, 0));
    }

    private List<String> banner(AlarmStore.Entry e) throws Exception {
        java.lang.reflect.Method m = AlarmService.class.getDeclaredMethod("buildNotification", Context.class,
                AlarmStore.Entry.class, String.class, boolean.class, boolean.class, long.class);
        m.setAccessible(true);
        Notification n = (Notification) m.invoke(null, ctx, e, "test", false, false, 0L);
        List<String> out = new ArrayList<>();
        if (n.actions != null) {
            for (Notification.Action act : n.actions) {
                out.add(String.valueOf(act.title));
            }
        }
        return out;
    }

    @Test
    public void aTaskHasDoneAndLaterAndNothingElse() {
        AlarmActivity a = open(task("two"), false);
        assertTrue(shown(a, R.id.alarm_done));
        assertTrue(shown(a, R.id.alarm_later_hold));
        assertFalse("Snooze is showing", shown(a, R.id.alarm_snooze_10) || shown(a, R.id.alarm_snooze_30) || shown(a, R.id.alarm_snooze_60) || shown(a, R.id.alarm_snooze_label));
        assertFalse("Open task is showing on a plain task", shown(a, R.id.alarm_dismiss));
        assertEquals("Done ✓", ((Button) a.findViewById(R.id.alarm_done)).getText().toString());
    }

    @Test
    public void laterNeedsTheWholeHold() {
        AlarmActivity a = open(task("hold"), false);
        View hold = a.findViewById(R.id.alarm_later_hold);
        touch(hold, MotionEvent.ACTION_DOWN);
        ShadowLooper.idleMainLooper(450, TimeUnit.MILLISECONDS);
        assertFalse("Later happened before the hold was over", a.isFinishing());
        ShadowLooper.idleMainLooper(450, TimeUnit.MILLISECONDS);
        assertTrue("Later did not happen after a full hold", a.isFinishing());
        assertTrue(sentToService(a).contains(AlarmService.ACTION_LATER));
    }

    @Test
    public void aQuickTapOnLaterOnlySaysKeepHolding() {
        AlarmActivity a = open(task("tap"), false);
        View hold = a.findViewById(R.id.alarm_later_hold);
        touch(hold, MotionEvent.ACTION_DOWN);
        ShadowLooper.idleMainLooper(120, TimeUnit.MILLISECONDS);
        touch(hold, MotionEvent.ACTION_UP);
        ShadowLooper.idleMainLooper(1, TimeUnit.SECONDS);
        assertFalse(a.isFinishing());
        assertFalse(sentToService(a).contains(AlarmService.ACTION_LATER));
        assertEquals(ctx.getString(R.string.alarm_hold_more), ((TextView) a.findViewById(R.id.alarm_later_hint)).getText().toString());
        ShadowLooper.idleMainLooper(3, TimeUnit.SECONDS);
        assertEquals(ctx.getString(R.string.alarm_later_hint), ((TextView) a.findViewById(R.id.alarm_later_hint)).getText().toString());
    }

    @Test
    public void lettingGoEarlyIsNotLater() {
        AlarmActivity a = open(task("early"), false);
        View hold = a.findViewById(R.id.alarm_later_hold);
        touch(hold, MotionEvent.ACTION_DOWN);
        ShadowLooper.idleMainLooper(500, TimeUnit.MILLISECONDS);
        touch(hold, MotionEvent.ACTION_UP);
        ShadowLooper.idleMainLooper(2, TimeUnit.SECONDS);
        assertFalse(a.isFinishing());
        assertFalse(sentToService(a).contains(AlarmService.ACTION_LATER));
    }

    @Test
    public void aScreenReadersDoubleTapCountsAsTheHold() {
        AlarmActivity a = open(task("reader"), false);
        a.findViewById(R.id.alarm_later_hold).performClick();
        assertTrue(a.isFinishing());
        assertTrue(sentToService(a).contains(AlarmService.ACTION_LATER));
    }

    @Test
    public void doneFinishesTheTaskInTheApp() {
        AlarmActivity a = open(task("done"), false);
        a.findViewById(R.id.alarm_done).performClick();
        assertTrue(a.isFinishing());
        assertTrue(sentToService(a).contains(AlarmService.ACTION_DONE));
        String path = openedPath(a);
        assertNotNull(path);
        assertTrue(path, path.contains("taskId=t1") && path.contains("done=1"));
    }

    @Test
    public void doneOnTheBannerDoesTheSame() {
        AlarmActivity a = open(task("bannerdone"), true);
        assertTrue(sentToService(a).contains(AlarmService.ACTION_DONE));
        String path = openedPath(a);
        assertNotNull(path);
        assertTrue(path, path.contains("done=1"));
    }

    @Test
    public void theBannerHasDoneAndLaterToo() throws Exception {
        assertEquals(Arrays.asList("Done ✓", "Later"), banner(task("b1")));
        AlarmStore.Entry ev = task("b2");
        ev.event = true;
        assertEquals(Arrays.asList("Stop"), banner(ev));
        AlarmStore.Entry timer = task("b3");
        timer.taskId = "";
        timer.noSnooze = true;
        assertEquals(Arrays.asList("Stop"), banner(timer));
        // switched off: the earlier banner
        ctx.getSharedPreferences("adhdone_alarm_screen", 0).edit().putString("screen", "classic").commit();
        assertEquals(Arrays.asList("Snooze 10 min", "Done ✓", "Stop"), banner(task("b4")));
    }

    @Test
    public void aTaskWithSomethingToDoInTheAppGetsItsButton() {
        AlarmStore.Entry e = task("text");
        e.openLabel = "Send the text";
        AlarmActivity a = open(e, false);
        assertTrue(shown(a, R.id.alarm_dismiss));
        assertEquals("Send the text", ((Button) a.findViewById(R.id.alarm_dismiss)).getText().toString());
        a.findViewById(R.id.alarm_dismiss).performClick();
        assertTrue(sentToService(a).contains(AlarmService.ACTION_DISMISS));
        String path = openedPath(a);
        assertNotNull(path);
        assertTrue(path, path.contains("taskId=t1") && !path.contains("done=1"));
    }

    @Test
    public void anEventHasGotItAndNoLater() {
        AlarmStore.Entry e = task("event");
        e.event = true;
        AlarmActivity a = open(e, false);
        assertEquals("Got it", ((Button) a.findViewById(R.id.alarm_done)).getText().toString());
        assertFalse(shown(a, R.id.alarm_later_hold));
        assertFalse(shown(a, R.id.alarm_dismiss));
        a.findViewById(R.id.alarm_done).performClick();
        assertTrue(sentToService(a).contains(AlarmService.ACTION_DISMISS));
        assertNull("Got it on an event opened the app", shadowOf(a).getNextStartedActivity());
    }

    @Test
    public void theTaskTimersEndShowsItsThreeChoices() {
        AlarmStore.Entry e = task("sprint");
        e.noSnooze = true;
        e.actionsJson = "[{\"label\":\"Keep going\",\"path\":\"/Home?sprint=keep\"},{\"label\":\"I finished the task\",\"path\":\"/Home?sprint=finish\"},{\"label\":\"Stop working\",\"path\":\"/Home?sprint=stop\"}]";
        AlarmActivity a = open(e, false);
        assertFalse(shown(a, R.id.alarm_done));
        assertFalse(shown(a, R.id.alarm_later_hold));
        assertEquals("Keep going", ((Button) a.findViewById(R.id.alarm_snooze_10)).getText().toString());
        assertEquals("I finished the task", ((Button) a.findViewById(R.id.alarm_snooze_30)).getText().toString());
        assertEquals("Stop working", ((Button) a.findViewById(R.id.alarm_snooze_60)).getText().toString());
        assertTrue(shown(a, R.id.alarm_snooze_10) && shown(a, R.id.alarm_snooze_30) && shown(a, R.id.alarm_snooze_60) && shown(a, R.id.alarm_dismiss));
        a.findViewById(R.id.alarm_snooze_30).performClick();
        assertEquals("/Home?sprint=finish", openedPath(a));
    }

    @Test
    public void threeTasksAtOnceOpenTheList() {
        AlarmStore.Entry e = task("three");
        e.companionsJson = "[{\"taskId\":\"t2\",\"title\":\"Feed the cat\"},{\"taskId\":\"t3\",\"title\":\"Take out the trash\"}]";
        AlarmActivity a = open(e, false);
        assertEquals("Open the app", ((Button) a.findViewById(R.id.alarm_done)).getText().toString());
        assertTrue(shown(a, R.id.alarm_later_hold));
        a.findViewById(R.id.alarm_done).performClick();
        assertEquals("/Tasks", openedPath(a));
    }

    @Test
    public void twoTasksEachGetTheirOwnDone() {
        AlarmStore.Entry e = task("pair");
        e.companionsJson = "[{\"taskId\":\"t2\",\"title\":\"Feed the cat\"}]";
        AlarmActivity a = open(e, false);
        View second = a.findViewById(R.id.alarm_done_row).findViewWithTag("done-second");
        assertNotNull(second);
        second.performClick();
        String path = openedPath(a);
        assertNotNull(path);
        assertTrue(path, path.contains("taskId=t2") && path.contains("done=1"));
    }

    @Test
    public void anAlarmThatIsNoLongerOnFileJustCloses() {
        Intent i = new Intent(ctx, AlarmActivity.class).putExtra(AlarmScheduler.EXTRA_ALARM_ID, "gone");
        AlarmActivity a = Robolectric.buildActivity(AlarmActivity.class, i).setup().get();
        assertTrue(a.isFinishing());
    }

    @Test
    public void theOffSwitchBringsTheEarlierScreenBack() throws Exception {
        assertTrue(AlarmLook.useNew(ctx));
        AlarmLook.adopt(ctx, new Base44Api.Result(200, new JSONObject().put("success", true), null));
        assertTrue("an answer with no word changed the screen", AlarmLook.useNew(ctx));
        AlarmLook.adopt(ctx, new Base44Api.Result(200, new JSONObject().put("alarm_screen", "classic"), null));
        assertFalse(AlarmLook.useNew(ctx));
        AlarmActivity a = open(task("classic"), false);
        assertNull(a.findViewById(R.id.alarm_later_hold));
        assertTrue(shown(a, R.id.alarm_snooze_10) && shown(a, R.id.alarm_later));
        AlarmLook.adopt(ctx, new Base44Api.Result(500, new JSONObject().put("alarm_screen", "new"), null));
        assertFalse("a failed answer changed the screen", AlarmLook.useNew(ctx));
        AlarmLook.adopt(ctx, new Base44Api.Result(200, new JSONObject().put("alarm_screen", "new"), null));
        assertTrue(AlarmLook.useNew(ctx));
    }

    @Test
    public void theEasedPlansAlarmIsDoneAndLaterOnly() {
        AlarmStore.Entry e = task("eased");
        e.eased = true;
        e.openLabel = "Send the text";
        AlarmActivity a = open(e, false);
        assertTrue(shown(a, R.id.alarm_done) && shown(a, R.id.alarm_later_hold));
        assertFalse(shown(a, R.id.alarm_dismiss) || shown(a, R.id.alarm_snooze_10));
    }
}
