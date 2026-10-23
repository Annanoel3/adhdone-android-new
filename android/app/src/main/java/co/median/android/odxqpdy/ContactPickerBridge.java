package co.median.android.odxqpdy;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import android.util.Log;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * ContactPickerBridge — permission-free contact picking.
 *
 * Launches the system contact picker (ACTION_PICK). The picking UI runs inside the
 * system Contacts app, so this app needs neither READ_CONTACTS nor WRITE_CONTACTS.
 * The picker returns a content:// URI for the single row the user chose, with
 * FLAG_GRANT_READ_URI_PERMISSION attached, which is what lets us read that one row
 * back through ContentResolver without holding any contacts permission.
 *
 * Called from the web app via:
 *   window.Capacitor.Plugins.ContactPickerBridge.pickContact()
 */
@CapacitorPlugin(name = "ContactPickerBridge")
public class ContactPickerBridge extends Plugin {

    private static final String TAG = "ADHDone";

    private static final String TYPE_EMAIL = "email";

    @Override
    public void load() {
        super.load();
        Log.d(TAG, "ContactPickerBridge loaded");
    }

    /**
     * Opens the system picker and resolves with the chosen contact row.
     * Optional option: { type: "phone" | "email" } — defaults to "phone".
     */
    @PluginMethod
    public void pickContact(PluginCall call) {
        String type = call.getString("type", "phone");
        boolean wantEmail = TYPE_EMAIL.equalsIgnoreCase(type);

        // Picking a Phone/Email row (rather than a whole contact) means the granted URI
        // already carries the number/address, so no follow-up permissioned query is needed.
        Uri pickUri = wantEmail
                ? ContactsContract.CommonDataKinds.Email.CONTENT_URI
                : ContactsContract.CommonDataKinds.Phone.CONTENT_URI;

        Intent intent = new Intent(Intent.ACTION_PICK, pickUri);
        try {
            startActivityForResult(call, intent, "handlePickResult");
        } catch (ActivityNotFoundException e) {
            call.reject("No contacts app is available to pick from.", "no-picker");
        } catch (Exception e) {
            call.reject("Could not open the contact picker: " + e.getMessage(), "picker-failed");
        }
    }

    @ActivityCallback
    private void handlePickResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        Uri contactUri = (result != null && result.getData() != null)
                ? result.getData().getData()
                : null;

        if (result == null || result.getResultCode() != Activity.RESULT_OK || contactUri == null) {
            Log.d(TAG, "ContactPickerBridge: picker cancelled");
            call.resolve(emptyResult(true));
            return;
        }

        Cursor cursor = null;
        try {
            // Null projection: the picker may hand back either a Phone or an Email data row,
            // so read whatever columns that row actually has rather than assuming.
            cursor = getContext().getContentResolver().query(contactUri, null, null, null, null);
            if (cursor == null || !cursor.moveToFirst()) {
                Log.w(TAG, "ContactPickerBridge: picked row returned no data");
                call.resolve(emptyResult(false));
                return;
            }

            String displayName = readString(cursor, ContactsContract.Contacts.DISPLAY_NAME_PRIMARY);
            if (displayName.isEmpty()) {
                displayName = readString(cursor, ContactsContract.Contacts.DISPLAY_NAME);
            }

            String phoneNumber = readString(cursor, ContactsContract.CommonDataKinds.Phone.NUMBER);
            String email = readString(cursor, ContactsContract.CommonDataKinds.Email.ADDRESS);
            String contactId = readString(cursor, ContactsContract.CommonDataKinds.Phone.CONTACT_ID);
            String lookupKey = readString(cursor, ContactsContract.Contacts.LOOKUP_KEY);
            String label = readLabel(cursor, !email.isEmpty() && phoneNumber.isEmpty());

            JSObject data = new JSObject();
            data.put("cancelled", false);
            data.put("displayName", displayName);
            data.put("phoneNumber", phoneNumber);
            data.put("email", email);
            data.put("label", label);
            data.put("contactId", contactId);
            data.put("lookupKey", lookupKey);

            Log.d(TAG, "ContactPickerBridge: picked contact"
                    + " (name=" + (displayName.isEmpty() ? "none" : "yes")
                    + ", phone=" + (phoneNumber.isEmpty() ? "none" : "yes")
                    + ", email=" + (email.isEmpty() ? "none" : "yes") + ")");
            call.resolve(data);
        } catch (SecurityException e) {
            // Would mean the picker did not attach a read grant for the returned row.
            Log.w(TAG, "ContactPickerBridge: no read access to picked row: " + e.getMessage());
            call.reject("Could not read the selected contact.", "read-denied");
        } catch (Exception e) {
            Log.w(TAG, "ContactPickerBridge: failed to read picked row: " + e.getMessage());
            call.reject("Could not read the selected contact: " + e.getMessage(), "read-failed");
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
    }

    /** Human-readable label for the picked row, e.g. "Mobile", "Home", "Work". */
    private String readLabel(Cursor cursor, boolean isEmailRow) {
        int typeIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.TYPE);
        if (typeIndex < 0 || cursor.isNull(typeIndex)) {
            return "";
        }
        int type = cursor.getInt(typeIndex);
        String customLabel = readString(cursor, ContactsContract.CommonDataKinds.Phone.LABEL);
        CharSequence resolved = isEmailRow
                ? ContactsContract.CommonDataKinds.Email.getTypeLabel(
                        getContext().getResources(), type, customLabel)
                : ContactsContract.CommonDataKinds.Phone.getTypeLabel(
                        getContext().getResources(), type, customLabel);
        return resolved != null ? resolved.toString() : "";
    }

    /** Reads a column by name, tolerating rows where that column does not exist. */
    private String readString(Cursor cursor, String columnName) {
        int index = cursor.getColumnIndex(columnName);
        if (index < 0 || cursor.isNull(index)) {
            return "";
        }
        String value = cursor.getString(index);
        return value != null ? value.trim() : "";
    }

    /** Uniform empty payload so the web app never has to deal with missing fields. */
    private JSObject emptyResult(boolean cancelled) {
        JSObject data = new JSObject();
        data.put("cancelled", cancelled);
        data.put("displayName", "");
        data.put("phoneNumber", "");
        data.put("email", "");
        data.put("label", "");
        data.put("contactId", "");
        data.put("lookupKey", "");
        return data;
    }
}
