package co.median.android.odxqpdy;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Toast;

/**
 * The Today widget's "+": a small dialog with one text box, nothing else. What is typed
 * goes down the same silent path as a sentence shared from another app — durable queue,
 * captureText on the server — so adding a task from the home screen never opens the app.
 * A widget can't take typing itself, which is why this tiny screen exists at all.
 */
public class WidgetCaptureActivity extends Activity {

    private static final String TAG = "ADHDone";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_widget_capture);
        setFinishOnTouchOutside(true);

        final EditText input = findViewById(R.id.widget_capture_input);
        Button add = findViewById(R.id.widget_capture_add);
        Button cancel = findViewById(R.id.widget_capture_cancel);

        add.setOnClickListener(v -> submit(input));
        cancel.setOnClickListener(v -> finish());
        // "Done" on the keyboard adds too; Enter keeps its usual job of starting a new line.
        input.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_DONE
                    || (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER
                        && event.getAction() == KeyEvent.ACTION_DOWN && !event.isShiftPressed()
                        && input.getLineCount() <= 1)) {
                submit(input);
                return true;
            }
            return false;
        });

        input.requestFocus();
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
    }

    private void submit(EditText input) {
        String text = input.getText() != null ? input.getText().toString().trim() : "";
        if (text.isEmpty()) {
            finish();
            return;
        }
        // SOURCE_SHARE: we acknowledge here, so the sync worker must not toast again.
        String id = CaptureQueue.enqueue(this, text, CaptureQueue.SOURCE_SHARE);
        if (id != null) {
            Log.d(TAG, "WidgetCaptureActivity: queued " + text.length() + " chars from the widget");
            Toast.makeText(this, "Adding task", Toast.LENGTH_SHORT).show();
            CaptureSyncWorker.kick(this);
        }
        finish();
    }
}
