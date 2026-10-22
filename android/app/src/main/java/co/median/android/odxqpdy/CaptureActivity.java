package co.median.android.odxqpdy;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.util.UUID;

/**
 * Invisible share-sheet target.
 *
 * Share targets have to be Activities, so this one exists purely to grab what was shared,
 * put it on the durable queue and finish before anything is drawn. The main app is never
 * opened. Text is queued as it is. An image (a screenshot, a flyer) is read into a small
 * JPEG in app storage first — the read has to happen while this activity is alive, because
 * the sender's permission to open the picture ends with it — and the sync worker then has
 * the server read that picture into a sentence.
 */
public class CaptureActivity extends Activity {

    private static final String TAG = "ADHDone";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!handle(getIntent())) {
            finish();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (!handle(intent)) {
            finish();
        }
    }

    /** Returns true when the work continues in the background and will finish() itself. */
    private boolean handle(Intent intent) {
        if (isImageShare(intent)) {
            queueImage(intent);
            return true;
        }
        String text = extractText(intent);
        if (text == null || text.isEmpty()) {
            Log.d(TAG, "CaptureActivity: nothing to capture");
            return false;
        }

        String id = CaptureQueue.enqueue(this, text, CaptureQueue.SOURCE_SHARE);
        if (id == null) {
            return false;
        }

        Log.d(TAG, "CaptureActivity: queued shared text (" + text.length() + " chars)");
        // This activity is genuinely in the foreground, so a toast here is reliable —
        // unlike one posted later from the background worker. Tagging the queue item as
        // SOURCE_SHARE stops CaptureSyncWorker toasting a second time after the drain.
        Toast.makeText(this, "Adding task", Toast.LENGTH_SHORT).show();
        CaptureSyncWorker.kick(this);
        return false;
    }

    private boolean isImageShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) {
            return false;
        }
        String type = intent.getType();
        return type != null && type.startsWith("image/") && intent.getParcelableExtra(Intent.EXTRA_STREAM) != null;
    }

    private void queueImage(Intent intent) {
        final Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        intent.removeExtra(Intent.EXTRA_STREAM);
        Toast.makeText(this, "Reading image", Toast.LENGTH_SHORT).show();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    byte[] jpeg = SharedImageReader.readJpeg(CaptureActivity.this, uri);
                    if (jpeg == null) {
                        Log.w(TAG, "CaptureActivity: shared image could not be read");
                        return;
                    }
                    File dir = new File(getFilesDir(), "captures");
                    //noinspection ResultOfMethodCallIgnored
                    dir.mkdirs();
                    File out = new File(dir, UUID.randomUUID().toString() + ".jpg");
                    try (FileOutputStream fos = new FileOutputStream(out)) {
                        fos.write(jpeg);
                    }
                    String id = CaptureQueue.enqueueImage(CaptureActivity.this, out.getAbsolutePath(), CaptureQueue.SOURCE_SHARE);
                    if (id != null) {
                        Log.d(TAG, "CaptureActivity: queued shared image (" + jpeg.length + " bytes)");
                        CaptureSyncWorker.kick(CaptureActivity.this);
                    }
                } catch (Exception e) {
                    Log.w(TAG, "CaptureActivity: could not queue shared image: " + e.getMessage());
                } finally {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            finish();
                        }
                    });
                }
            }
        }, "adhdone-capture-image").start();
    }

    private String extractText(Intent intent) {
        if (intent == null) {
            return null;
        }
        String type = intent.getType();
        if (!Intent.ACTION_SEND.equals(intent.getAction())
                || type == null || !type.startsWith("text/plain")) {
            return null;
        }

        String shared = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (shared == null) {
            return null;
        }
        shared = shared.trim();

        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        // Chrome-style shares send the page title as subject and a bare URL as text.
        if (subject != null && !subject.trim().isEmpty() && isBareUrl(shared)) {
            shared = subject.trim() + " " + shared;
        }

        intent.removeExtra(Intent.EXTRA_TEXT);
        intent.removeExtra(Intent.EXTRA_SUBJECT);
        return shared;
    }

    private boolean isBareUrl(String value) {
        return value.matches("(?i)^https?://\\S+$");
    }
}
