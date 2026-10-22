package co.median.android.odxqpdy;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.TextView;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The look of the full-screen alarm, copied from whatever the web app is
 * currently showing. The web app reads its own page background, text colours
 * and accent, and hands them over through AlarmBridge.setTheme(); nothing here
 * knows theme names. With nothing saved yet the layout's built-in colours
 * (colors_alarm.xml) are left as they are.
 *
 * Two kinds of background:
 *  - colours: one flat colour or a gradient, drawn directly;
 *  - image: the seasonal artwork the app itself uses as its page background
 *    (a URL from Layout.jsx). It is downloaded once to app storage and shown
 *    behind a dark scrim so the alarm text stays readable on top of it. Until
 *    the download has finished — or if it never does — the colours are used.
 *
 * Stored as plain strings so a bad value can never crash the alarm: any colour
 * that fails to parse is simply skipped.
 */
final class AlarmTheme {

    private static final String TAG = "ADHDone";
    private static final String PREFS = "adhdone_alarm_theme";
    private static final String KEY_COLORS = "colors";      // comma-separated hex, 1..8
    private static final String KEY_ANGLE = "angle";        // CSS degrees: 0 = to top, 90 = to right
    private static final String KEY_TEXT = "text";
    private static final String KEY_MUTED = "muted";
    private static final String KEY_ACCENT = "accent";
    private static final String KEY_ON_ACCENT = "onAccent";
    private static final String KEY_IMAGE_URL = "image_url";
    private static final String KEY_IMAGE_READY_URL = "image_ready_url";
    private static final String IMAGE_FILE = "adhdone_alarm_bg";
    private static final long MAX_IMAGE_BYTES = 12L * 1024 * 1024;
    private static final int TIMEOUT_MS = 20_000;
    // How dark the scrim over an image is (0 = none, 255 = black).
    private static final int SCRIM_ALPHA = 0x99;
    private static final ExecutorService pool = Executors.newSingleThreadExecutor();

    private AlarmTheme() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static File imageFile(Context c) {
        return new File(c.getFilesDir(), IMAGE_FILE);
    }

    static void set(Context c, List<String> colors, int angle, String text, String muted,
                    String accent, String onAccent, String imageUrl) {
        StringBuilder sb = new StringBuilder();
        int n = 0;
        for (String col : colors) {
            if (parse(col) == null || n >= 8) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append(',');
            }
            sb.append(col.trim());
            n++;
        }
        String img = imageUrl == null ? "" : imageUrl.trim();
        if (!(img.startsWith("https://") || img.startsWith("http://"))) {
            img = "";
        }
        prefs(c).edit()
                .putString(KEY_COLORS, sb.toString())
                .putInt(KEY_ANGLE, angle)
                .putString(KEY_TEXT, text == null ? "" : text.trim())
                .putString(KEY_MUTED, muted == null ? "" : muted.trim())
                .putString(KEY_ACCENT, accent == null ? "" : accent.trim())
                .putString(KEY_ON_ACCENT, onAccent == null ? "" : onAccent.trim())
                .putString(KEY_IMAGE_URL, img)
                .apply();
        if (img.isEmpty()) {
            //noinspection ResultOfMethodCallIgnored
            imageFile(c).delete();
            prefs(c).edit().remove(KEY_IMAGE_READY_URL).apply();
        } else {
            ensureImageDownloaded(c);
        }
    }

    static void clear(Context c) {
        prefs(c).edit().clear().apply();
        //noinspection ResultOfMethodCallIgnored
        imageFile(c).delete();
    }

    static boolean isSet(Context c) {
        return !prefs(c).getString(KEY_COLORS, "").isEmpty()
                || !prefs(c).getString(KEY_IMAGE_URL, "").isEmpty();
    }

    static String imageUrl(Context c) {
        return prefs(c).getString(KEY_IMAGE_URL, "");
    }

    /** True when the chosen image is on disk and matches the current choice. */
    static boolean imageReady(Context c) {
        String url = imageUrl(c);
        if (url.isEmpty()) {
            return false;
        }
        File f = imageFile(c);
        return url.equals(prefs(c).getString(KEY_IMAGE_READY_URL, "")) && f.isFile() && f.length() > 0;
    }

    /** Fetches the background image in the background if it isn't on disk yet. */
    static void ensureImageDownloaded(Context c) {
        final Context app = c.getApplicationContext();
        if (imageReady(app)) {
            return;
        }
        final String url = imageUrl(app);
        if (url.isEmpty()) {
            return;
        }
        pool.execute(new Runnable() {
            @Override
            public void run() {
                downloadImage(app, url);
            }
        });
    }

    private static boolean downloadImage(Context c, String url) {
        File target = imageFile(c);
        File tmp = new File(c.getFilesDir(), IMAGE_FILE + ".part");
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);
            conn.setInstanceFollowRedirects(true);
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                Log.w(TAG, "AlarmTheme: image download failed, HTTP " + code);
                return false;
            }
            long total = 0;
            try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(tmp)) {
                byte[] buf = new byte[16 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) {
                    total += n;
                    if (total > MAX_IMAGE_BYTES) {
                        Log.w(TAG, "AlarmTheme: image too large, giving up");
                        return false;
                    }
                    out.write(buf, 0, n);
                }
            }
            if (total == 0) {
                return false;
            }
            //noinspection ResultOfMethodCallIgnored
            target.delete();
            if (!tmp.renameTo(target)) {
                return false;
            }
            if (url.equals(imageUrl(c))) {
                prefs(c).edit().putString(KEY_IMAGE_READY_URL, url).apply();
            }
            Log.d(TAG, "AlarmTheme: background image downloaded, " + total + " bytes");
            return true;
        } catch (Exception e) {
            Log.w(TAG, "AlarmTheme: image download failed", e);
            return false;
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
        }
    }

    /** Decodes the stored image at roughly screen size (never the full file into memory). */
    private static Bitmap loadImage(Context c, int targetW, int targetH) {
        File f = imageFile(c);
        if (!f.isFile()) {
            return null;
        }
        try {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(f.getPath(), o);
            int sample = 1;
            int w = Math.max(1, targetW), h = Math.max(1, targetH);
            while (o.outWidth / (sample * 2) >= w && o.outHeight / (sample * 2) >= h) {
                sample *= 2;
            }
            BitmapFactory.Options real = new BitmapFactory.Options();
            real.inSampleSize = sample;
            real.inPreferredConfig = Bitmap.Config.RGB_565;
            return BitmapFactory.decodeFile(f.getPath(), real);
        } catch (Throwable t) {
            Log.w(TAG, "AlarmTheme: could not decode background image", t);
            return null;
        }
    }

    /**
     * Applies the saved look to the alarm screen. No-op when nothing is saved.
     * {@code image} and {@code scrim} sit behind the content; they are shown
     * only when the theme has an image that is already on disk.
     */
    static void apply(Context c, View root, ImageView image, View scrim, TextView heading, TextView title,
                      TextView snoozeLabel, Button[] snoozes, Button dismiss) {
        SharedPreferences p = prefs(c);
        boolean usedImage = false;
        if (imageReady(c) && image != null) {
            int w = c.getResources().getDisplayMetrics().widthPixels;
            int h = c.getResources().getDisplayMetrics().heightPixels;
            Bitmap bmp = loadImage(c, w, h);
            if (bmp != null) {
                image.setImageBitmap(bmp);
                image.setScaleType(ImageView.ScaleType.CENTER_CROP);
                image.setVisibility(View.VISIBLE);
                if (scrim != null) {
                    scrim.setBackgroundColor(Color.argb(SCRIM_ALPHA, 0, 0, 0));
                    scrim.setVisibility(View.VISIBLE);
                }
                usedImage = true;
            }
        } else {
            ensureImageDownloaded(c); // ready for next time
        }
        if (!usedImage) {
            if (image != null) {
                image.setVisibility(View.GONE);
            }
            if (scrim != null) {
                scrim.setVisibility(View.GONE);
            }
        }

        String colorsCsv = p.getString(KEY_COLORS, "");
        List<Integer> colors = new ArrayList<>();
        for (String s : colorsCsv.isEmpty() ? new String[0] : colorsCsv.split(",")) {
            Integer col = parse(s);
            if (col != null) {
                colors.add(col);
            }
        }
        if (!usedImage && !colors.isEmpty()) {
            if (colors.size() == 1) {
                root.setBackgroundColor(colors.get(0));
            } else {
                int[] arr = new int[colors.size()];
                for (int i = 0; i < arr.length; i++) {
                    arr[i] = colors.get(i);
                }
                GradientDrawable g = new GradientDrawable(orientation(p.getInt(KEY_ANGLE, 135)), arr);
                g.setGradientType(GradientDrawable.LINEAR_GRADIENT);
                root.setBackground(g);
            }
        } else if (usedImage) {
            // A dark base so any transparent edge of the image reads as night, not white.
            root.setBackgroundColor(Color.BLACK);
        }

        // On an image the text is always light: the scrim guarantees contrast.
        Integer text = usedImage ? Integer.valueOf(Color.WHITE) : parse(p.getString(KEY_TEXT, ""));
        Integer muted = usedImage ? Integer.valueOf(0xFFE5E7EB) : parse(p.getString(KEY_MUTED, ""));
        Integer accent = parse(p.getString(KEY_ACCENT, ""));
        Integer onAccent = parse(p.getString(KEY_ON_ACCENT, ""));
        if (text != null) {
            title.setTextColor(text);
        }
        if (muted != null) {
            heading.setTextColor(muted);
            snoozeLabel.setTextColor(muted);
        }
        if (accent != null) {
            dismiss.setBackgroundTintList(android.content.res.ColorStateList.valueOf(accent));
            for (Button b : snoozes) {
                // Snooze buttons: a soft version of the accent so the big
                // "Got it" stays the obvious one.
                b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(
                        withAlpha(accent, usedImage ? 0x66 : 0x33)));
                if (text != null) {
                    b.setTextColor(text);
                }
            }
        }
        if (onAccent != null) {
            dismiss.setTextColor(onAccent);
        }
    }

    private static GradientDrawable.Orientation orientation(int cssDegrees) {
        int a = ((cssDegrees % 360) + 360) % 360;
        int step = (int) Math.round(a / 45.0) % 8;
        switch (step) {
            case 0: return GradientDrawable.Orientation.BOTTOM_TOP;   // to top
            case 1: return GradientDrawable.Orientation.BL_TR;        // to top right
            case 2: return GradientDrawable.Orientation.LEFT_RIGHT;   // to right
            case 3: return GradientDrawable.Orientation.TL_BR;        // to bottom right
            case 4: return GradientDrawable.Orientation.TOP_BOTTOM;   // to bottom
            case 5: return GradientDrawable.Orientation.TR_BL;        // to bottom left
            case 6: return GradientDrawable.Orientation.RIGHT_LEFT;   // to left
            default: return GradientDrawable.Orientation.BR_TL;       // to top left
        }
    }

    private static int withAlpha(int color, int alpha) {
        return Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color));
    }

    /** "#rgb", "#rrggbb" or "#aarrggbb" to a colour int; null for anything else. */
    static Integer parse(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        if (t.length() == 4 && t.charAt(0) == '#') {
            t = "#" + t.charAt(1) + t.charAt(1) + t.charAt(2) + t.charAt(2) + t.charAt(3) + t.charAt(3);
        }
        if (!(t.length() == 7 || t.length() == 9) || t.charAt(0) != '#') {
            return null;
        }
        try {
            return Color.parseColor(t);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
