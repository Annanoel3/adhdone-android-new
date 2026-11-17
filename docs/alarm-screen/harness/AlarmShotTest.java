package co.median.android.odxqpdy;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.view.View;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import org.robolectric.shadows.ShadowLooper;

import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Draws the real alarm screen (AlarmActivity) to pictures, with no phone:
 * /tmp/ab/shots/sheet.jpg (ten situations) and the two screens the Play Store
 * pictures use. Lives in docs/alarm-screen/harness and is copied into the
 * build COPY by setup.py; it is never part of the app. The log says, for each
 * screen, whether the content fits the screen and where each button ended up.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = android.app.Application.class, shadows = { AlarmShotTest.QuietKeyguard.class })
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class AlarmShotTest {

    /** Robolectric's own keyguard shadow trips over the null callback a real phone accepts. */
    @org.robolectric.annotation.Implements(android.app.KeyguardManager.class)
    public static class QuietKeyguard extends org.robolectric.shadows.ShadowKeyguardManager {
        @org.robolectric.annotation.Implementation
        protected void requestDismissKeyguard(android.app.Activity activity, android.app.KeyguardManager.KeyguardDismissCallback callback) {
        }
    }

    private static final String PHONE = "w360dp-h760dp-xhdpi";
    private static final String SMALL = "w320dp-h568dp-xhdpi";
    private final List<Bitmap> tiles = new ArrayList<>();
    private final List<String> names = new ArrayList<>();

    private static AlarmStore.Entry task(String heading, String body, String title) {
        AlarmStore.Entry e = new AlarmStore.Entry();
        e.taskId = "t1";
        e.title = title;
        e.heading = heading;
        e.body = body;
        return e;
    }

    private static File dir() {
        File d = new File(System.getProperty("shots.dir", "/tmp/ab/shots"));
        d.mkdirs();
        return d;
    }

    private Bitmap shot(String name, String qualifiers, float fontScale, int look, String theme,
                        AlarmStore.Entry e, float holdAt, boolean classic) throws Exception {
        RuntimeEnvironment.setQualifiers(qualifiers);
        RuntimeEnvironment.setFontScale(fontScale);
        Context ctx = ApplicationProvider.getApplicationContext();
        ctx.getSharedPreferences("adhdone_alarm_look", 0).edit().putInt("next", look).commit();
        ctx.getSharedPreferences("adhdone_alarm_screen", 0).edit().putString("screen", classic ? "classic" : "").commit();
        if ("light".equals(theme)) {
            AlarmTheme.set(ctx, Arrays.asList("#fcd3a6", "#fbbfa8", "#f7a9b4"), 180, "#111827", "#4b5563", "#8b5cf6", "#ffffff", "");
        } else if ("teal".equals(theme)) {
            AlarmTheme.set(ctx, Arrays.asList("#0f2a2e", "#123c3a"), 135, "#ffffff", "#c9c3dc", "#14b8a6", "#ffffff", "");
        } else {
            AlarmTheme.clear(ctx);
        }
        e.id = name;
        e.at = System.currentTimeMillis() - 10 * 60 * 1000L;
        AlarmStore.put(ctx, e);
        Intent i = new Intent(ctx, AlarmActivity.class).putExtra(AlarmScheduler.EXTRA_ALARM_ID, e.id);
        ActivityController<AlarmActivity> c = Robolectric.buildActivity(AlarmActivity.class, i).setup();
        ShadowLooper.idleMainLooper(2, TimeUnit.SECONDS);
        AlarmActivity a = c.get();
        View root = a.getWindow().getDecorView();
        View hold = a.findViewById(R.id.alarm_later_hold);
        if (holdAt > 0f && hold != null) {
            java.lang.reflect.Field f = HoldLaterView.class.getDeclaredField("progress");
            f.setAccessible(true);
            f.setFloat(hold, holdAt);
        }
        int w = root.getWidth();
        int h = root.getHeight();
        StringBuilder line = new StringBuilder("SHOT " + name + " " + w + "x" + h);
        View content = a.findViewById(R.id.alarm_content);
        if (content != null && !classic) {
            line.append(content.getHeight() > h ? "  <<< TALLER THAN THE SCREEN" : "  fits");
        }
        int[] ids = { R.id.alarm_done, R.id.alarm_later_hold, R.id.alarm_dismiss, R.id.alarm_snooze_10 };
        String[] idNames = { "round", "later", "third", "snooze" };
        for (int k = 0; k < ids.length; k++) {
            View v = a.findViewById(ids[k]);
            if (v == null || v.getVisibility() != View.VISIBLE) {
                continue;
            }
            int[] at = new int[2];
            v.getLocationInWindow(at);
            line.append(" | ").append(idNames[k]).append(' ').append(at[1]).append("-").append(at[1] + v.getHeight());
            if (at[1] + v.getHeight() > h) {
                line.append(" OFF SCREEN");
            }
        }
        View area = a.findViewById(R.id.alarm_words_area);
        View words = a.findViewById(R.id.alarm_words);
        if (area != null && words != null && words.getHeight() > area.getHeight() - area.getPaddingTop() - area.getPaddingBottom()) {
            line.append(" | WORDS CUT BY THEIR BOX (").append(words.getHeight()).append(" in ").append(area.getHeight()).append(")");
        }
        System.out.println(line);
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        root.draw(new Canvas(b));
        c.pause().stop().destroy();
        return b;
    }

    private void tile(String name, String qualifiers, float fontScale, int look, String theme,
                      AlarmStore.Entry e, float holdAt, boolean classic) throws Exception {
        tiles.add(shot(name, qualifiers, fontScale, look, theme, e, holdAt, classic));
        names.add(name);
    }

    @Test
    public void shots() throws Exception {
        android.os.SystemClock.setCurrentTimeMillis(1794839400000L); // 2:30 PM on the clock
        String words = "Now's a good time. Two minutes and it's off your list.";
        tile("01 dark", PHONE, 1f, 0, "", task("Water the plants", words, "Water the plants"), 0f, false);
        tile("02 light, holding Later", PHONE, 1f, 1, "light", task("Water the plants", words, "Water the plants"), 0.58f, false);
        AlarmStore.Entry text = task("Text the landlord about the leak in the bathroom ceiling", "It has waited since Monday. Write the first line and the rest follows, then send it before the office closes at five.", "Text the landlord");
        text.openLabel = "Send the text";
        tile("03 card, a text task", PHONE, 1f, 2, "", text, 0f, false);
        tile("04 small phone, big font", SMALL, 1.3f, 3, "teal", task("Water the plants", words, "Water the plants"), 0f, false);
        AlarmStore.Entry ev = task("Dentist at 3:00 PM", "Leave by 2:35 to be on time.", "Dentist");
        ev.event = true;
        ev.openLabel = "Record notes";
        tile("05 event", PHONE, 1f, 0, "", ev, 0f, false);
        AlarmStore.Entry two = task("Two things for now", "", "Water the plants");
        two.companionsJson = "[{\"taskId\":\"t2\",\"title\":\"Feed the cat\"}]";
        tile("06 two tasks", PHONE, 1f, 0, "light", two, 0f, false);
        AlarmStore.Entry eased = task("Fold the laundry", "Ten minutes would do it.", "Fold the laundry");
        eased.eased = true;
        tile("07 eased plan", PHONE, 1f, 1, "", eased, 0f, false);
        AlarmStore.Entry timer = task("Timer finished", "25 minutes are up.", "Timer");
        timer.taskId = "";
        timer.noSnooze = true;
        tile("08 timer's end", PHONE, 1f, 0, "", timer, 0f, false);
        tile("09 earlier screen (off switch)", PHONE, 1f, 0, "", task("Water the plants", words, "Water the plants"), 0f, true);
        tile("10 small phone, a text task", SMALL, 1f, 2, "", text, 0f, false);

        int tw = 360, pad = 16, cols = 5;
        int rows = (tiles.size() + cols - 1) / cols;
        int th = 0;
        for (Bitmap b : tiles) th = Math.max(th, b.getHeight() * tw / b.getWidth());
        Bitmap sheet = Bitmap.createBitmap(cols * (tw + pad) + pad, rows * (th + pad + 26) + pad, Bitmap.Config.ARGB_8888);
        Canvas sc = new Canvas(sheet);
        sc.drawColor(Color.rgb(244, 240, 236));
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        p.setColor(Color.rgb(43, 39, 48));
        p.setTextSize(18f);
        for (int k = 0; k < tiles.size(); k++) {
            Bitmap b = tiles.get(k);
            int x = pad + (k % cols) * (tw + pad);
            int y = pad + (k / cols) * (th + pad + 26);
            sc.drawText(names.get(k), x, y + 18, p);
            sc.drawBitmap(b, null, new Rect(x, y + 26, x + tw, y + 26 + b.getHeight() * tw / b.getWidth()), p);
        }
        try (FileOutputStream out = new FileOutputStream(new File(dir(), "sheet.jpg"))) {
            sheet.compress(Bitmap.CompressFormat.JPEG, 84, out);
        }

        // The two screens in the Play Store pictures, at full size.
        Bitmap s1 = shot("slide1", PHONE, 1f, 0, "", task("Call the dentist", words, "Call the dentist"), 0f, false);
        AlarmStore.Entry leave = task("Time to leave — Eye doctor appointment", "\"Eye doctor appointment\" is about 18 min away with expected traffic, so head out now to get there on time.", "Eye doctor appointment");
        leave.taskId = "";
        leave.event = true;
        Bitmap s4 = shot("slide4", PHONE, 1f, 0, "", leave, 0f, false);
        try (FileOutputStream out = new FileOutputStream(new File(dir(), "store-slide-1-screen.jpg"))) {
            s1.compress(Bitmap.CompressFormat.JPEG, 94, out);
        }
        try (FileOutputStream out = new FileOutputStream(new File(dir(), "store-slide-4-screen-plain.jpg"))) {
            s4.compress(Bitmap.CompressFormat.JPEG, 94, out);
        }
    }
}
