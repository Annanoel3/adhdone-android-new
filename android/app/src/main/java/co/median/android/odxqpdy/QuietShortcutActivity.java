package co.median.android.odxqpdy;

import android.app.Activity;
import android.os.Bundle;
import android.widget.Toast;

/**
 * "Quiet for 1 hour", from the long-press menu on the ADHDone icon
 * (res/xml/shortcuts.xml). Nothing shows but a short message: ADHDone goes quiet
 * for an hour, exactly like the widget's "Silence 1 hr" (ReminderPause), and this
 * invisible screen closes at once. A quiet already set for longer is left alone.
 */
public class QuietShortcutActivity extends Activity {

    private static final long HOUR_MS = 60L * 60L * 1000L;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String message;
        if (ReminderPause.isPaused(this) && ReminderPause.until(this) >= System.currentTimeMillis() + HOUR_MS) {
            message = "ADHDone is already quiet until " + ReminderPause.untilLabel(this) + ".";
        } else {
            ReminderPause.silence(this, 1, false);
            message = "ADHDone is quiet until " + ReminderPause.untilLabel(this)
                    + ". Reminders still show up, just with no sound.";
        }
        Toast.makeText(getApplicationContext(), message, Toast.LENGTH_LONG).show();
        finish();
    }
}
