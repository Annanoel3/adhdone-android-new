package co.median.android.odxqpdy;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;
import android.util.Log;

/**
 * The "Add a task/idea" button people can put in their phone's Quick Settings
 * (the panel pulled down from the top of the screen). Tapping it opens the same
 * small typing box as the widget's "+" and the pinned notification
 * (WidgetCaptureActivity), so a task goes in without opening the app. On a
 * locked phone it asks to unlock first.
 */
public class AddTaskTileService extends TileService {

    private static final String TAG = "ADHDone";
    // PendingIntent request code. ReminderPause lists the ones in use (4411-4437).
    private static final int RC_TILE = 4441;

    @Override
    public void onStartListening() {
        super.onStartListening();
        Tile tile = getQsTile();
        if (tile == null) {
            return;
        }
        tile.setState(Tile.STATE_INACTIVE);
        tile.setLabel(getString(R.string.tile_add_task));
        tile.updateTile();
    }

    @Override
    public void onClick() {
        super.onClick();
        if (isLocked()) {
            unlockAndRun(this::openBox);
        } else {
            openBox();
        }
    }

    @SuppressWarnings("deprecation")
    private void openBox() {
        Intent box = new Intent(this, WidgetCaptureActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                // Android 14+ only accepts a PendingIntent here.
                PendingIntent pi = PendingIntent.getActivity(this, RC_TILE, box,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                startActivityAndCollapse(pi);
            } else {
                startActivityAndCollapse(box);
            }
        } catch (Exception e) {
            Log.w(TAG, "AddTaskTileService: could not open the typing box", e);
        }
    }
}
