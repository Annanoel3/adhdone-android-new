package co.median.android.odxqpdy;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.onesignal.OneSignal;
import com.onesignal.user.subscriptions.IPushSubscription;
import com.onesignal.user.subscriptions.IPushSubscriptionObserver;
import com.onesignal.user.subscriptions.PushSubscriptionChangedState;
import com.onesignal.user.subscriptions.PushSubscriptionState;
import com.onesignal.notifications.INotification;
import com.onesignal.notifications.INotificationClickListener;
import com.onesignal.notifications.INotificationClickEvent;

import kotlin.coroutines.Continuation;
import kotlin.coroutines.CoroutineContext;
import kotlin.coroutines.EmptyCoroutineContext;

import org.jetbrains.annotations.NotNull;
import org.json.JSONObject;

import java.util.Iterator;

/**
 * NotifyBridge — Custom Capacitor plugin bridging the web app to the native OneSignal SDK.
 * Called from the web app via: window.Capacitor.Plugins.NotifyBridge.<method>()
 */
@CapacitorPlugin(name = "NotifyBridge")
public class NotifyBridge extends Plugin {

    private static final String TAG = "NotifyBridge";

    // Holds the additional-data payload of the notification that opened the
    // app on cold start. The web app retrieves (and clears) it via
    // getLaunchNotification() so the follow-up popup can be shown even when
    // the JS listener wasn't attached yet when the click fired.
    private static JSONObject lastLaunchNotificationData = null;

    /** Event emitted once the push subscription actually has an FCM token. */
    private static final String EVENT_SUBSCRIPTION_CHANGED = "pushSubscriptionChanged";

    /** Held so it can be detached in handleOnDestroy() and not leak the plugin. */
    private IPushSubscriptionObserver pushSubscriptionObserver = null;

    @Override
    public void load() {
        Log.d(TAG, "NotifyBridge loaded");
        super.load();
        registerNotificationClickListener();
        registerPushSubscriptionObserver();
    }

    @Override
    protected void handleOnDestroy() {
        removePushSubscriptionObserver();
        super.handleOnDestroy();
    }

    /**
     * Watch the push subscription so the web app learns when the device becomes genuinely
     * deliverable.
     *
     * On a fresh install OneSignal.login() returns before FCM has issued a token: the
     * subscription record exists but has no token behind it, so a player ID saved at that
     * moment is undeliverable (cronTaskReminders -> notifySend targets include_player_ids).
     * This fires when the token lands, letting the web app save the ID at the right moment
     * instead of at t=0.
     */
    private void registerPushSubscriptionObserver() {
        try {
            IPushSubscription subscription = OneSignal.getUser().getPushSubscription();
            if (subscription == null) {
                Log.w(TAG, "No push subscription available to observe");
                return;
            }

            pushSubscriptionObserver = new IPushSubscriptionObserver() {
                @Override
                public void onPushSubscriptionChange(@NotNull PushSubscriptionChangedState state) {
                    try {
                        PushSubscriptionState current = state.getCurrent();
                        if (current == null) {
                            return;
                        }

                        String token = current.getToken();
                        String id = current.getId();
                        boolean optedIn = current.getOptedIn();

                        // Only interesting once a real token exists — that is the moment the
                        // device can actually receive a push.
                        if (token == null || token.isEmpty()) {
                            Log.d(TAG, "Push subscription changed but token is still empty");
                            return;
                        }

                        JSObject payload = new JSObject();
                        payload.put("id", id != null ? id : "");
                        payload.put("token", token);
                        payload.put("optedIn", optedIn);
                        payload.put("subscribed", optedIn);

                        Log.d(TAG, "Push subscription ready: id=" + id + " optedIn=" + optedIn);
                        notifyListeners(EVENT_SUBSCRIPTION_CHANGED, payload, true);
                    } catch (Exception e) {
                        Log.e(TAG, "Error handling push subscription change: " + e.getMessage());
                    }
                }
            };

            subscription.addObserver(pushSubscriptionObserver);
            Log.d(TAG, "Push subscription observer registered");
        } catch (Exception e) {
            Log.e(TAG, "Failed to register push subscription observer: " + e.getMessage());
        }
    }

    private void removePushSubscriptionObserver() {
        if (pushSubscriptionObserver == null) {
            return;
        }
        try {
            IPushSubscription subscription = OneSignal.getUser().getPushSubscription();
            if (subscription != null) {
                subscription.removeObserver(pushSubscriptionObserver);
                Log.d(TAG, "Push subscription observer removed");
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to remove push subscription observer: " + e.getMessage());
        } finally {
            pushSubscriptionObserver = null;
        }
    }

    /**
     * Register a OneSignal click listener so tapping a notification emits a
     * "notificationOpened" Capacitor event to the web app and stores the data
     * for cold-start retrieval. Without this, notification taps only open the
     * app and the web-side follow-up popup never appears.
     */
    private void registerNotificationClickListener() {
        try {
            OneSignal.getNotifications().addClickListener(new INotificationClickListener() {
                @Override
                public void onClick(@NotNull INotificationClickEvent event) {
                    try {
                        INotification notification = event.getNotification();
                        JSONObject data = notification.getAdditionalData();
                        if (data == null) data = new JSONObject();
                        // Which action button was tapped (snooze_15, snooze_60, complete),
                        // or nothing for a plain tap. The web app acts on it; without this
                        // every button just opened the app.
                        try {
                            String actionId = event.getResult() != null ? event.getResult().getActionId() : null;
                            if (actionId != null && !actionId.isEmpty()) {
                                data.put("actionId", actionId);
                            }
                        } catch (Exception ignored) {
                        }

                        // Store for cold-start retrieval (getLaunchNotification)
                        lastLaunchNotificationData = data;

                        // Emit to any live web listeners (warm start)
                        JSObject wrapper = new JSObject();
                        wrapper.put("data", toJSObject(data));
                        notifyListeners("notificationOpened", wrapper);

                        Log.d(TAG, "Notification opened, data: " + data.toString());
                    } catch (Exception e) {
                        Log.e(TAG, "Error handling notification click: " + e.getMessage());
                    }
                }
            });
            Log.d(TAG, "Notification click listener registered");
        } catch (Exception e) {
            Log.e(TAG, "Failed to register notification click listener: " + e.getMessage());
        }
    }

    /** Convert a JSONObject to a Capacitor JSObject by copying keys. */
    private JSObject toJSObject(JSONObject data) {
        JSObject result = new JSObject();
        if (data == null) return result;
        Iterator<String> keys = data.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            try {
                Object value = data.get(key);
                result.put(key, value == null ? "" : value);
            } catch (Exception e) {
                // skip unreadable key
            }
        }
        return result;
    }

    /** Associate the logged-in user's email with their OneSignal player ID */
    @PluginMethod
    public void login(PluginCall call) {
        String externalId = call.getString("externalId");
        if (externalId == null || externalId.isEmpty()) {
            call.reject("External ID is required");
            return;
        }
        try {
            OneSignal.login(externalId);

            String playerId = getPlayerId();
            JSObject result = new JSObject();
            result.put("playerId", playerId);
            result.put("externalId", externalId);

            // Honest readiness. OneSignal.login() is asynchronous, so on a fresh install the
            // token is usually still empty here — "subscribed" says whether this device can
            // actually receive a push right now, rather than implying success. The web app
            // should wait for the "pushSubscriptionChanged" event before saving the player ID
            // when subscribed is false.
            String token = "";
            boolean optedIn = false;
            try {
                IPushSubscription sub = OneSignal.getUser().getPushSubscription();
                if (sub != null) {
                    String subToken = sub.getToken();
                    token = subToken != null ? subToken : "";
                    optedIn = sub.getOptedIn();
                }
            } catch (Exception e) {
                Log.w(TAG, "Could not read push subscription state: " + e.getMessage());
            }

            boolean subscribed = !token.isEmpty() && optedIn;
            result.put("token", token);
            result.put("optedIn", optedIn);
            result.put("subscribed", subscribed);

            Log.d(TAG, "login: playerId=" + playerId + " hasToken=" + !token.isEmpty()
                    + " optedIn=" + optedIn + " subscribed=" + subscribed);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to login: " + e.getMessage());
        }
    }

    /** Get the OneSignal Player ID for this device */
    @PluginMethod
    public void getPlayerId(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("playerId", getPlayerId());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to get Player ID: " + e.getMessage());
        }
    }

    /** Remove the external user ID association (call on logout) */
    @PluginMethod
    public void logout(PluginCall call) {
        try {
            OneSignal.logout();
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to logout: " + e.getMessage());
        }
    }

    /**
     * Opens ADHDone's page in the Play Store app, for the "there's an update"
     * popup. The web app can't do this itself: the WebView keeps every web
     * link inside the app and only hands sms:/tel:/mailto:/geo: to other apps
     * (MainActivity.launchExternalScheme). Falls back to the Play web page in
     * the phone's browser when the Play Store app isn't there.
     */
    @PluginMethod
    public void openPlayStore(PluginCall call) {
        String pkg = getContext().getPackageName();
        try {
            android.content.Intent market = new android.content.Intent(android.content.Intent.ACTION_VIEW,
                    android.net.Uri.parse("market://details?id=" + pkg));
            market.setPackage("com.android.vending");
            market.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(market);
            call.resolve();
            return;
        } catch (android.content.ActivityNotFoundException e) {
            Log.w(TAG, "openPlayStore: no Play Store app, trying the web page");
        } catch (Exception e) {
            Log.w(TAG, "openPlayStore: Play Store app refused, trying the web page", e);
        }
        try {
            android.content.Intent web = new android.content.Intent(android.content.Intent.ACTION_VIEW,
                    android.net.Uri.parse("https://play.google.com/store/apps/details?id=" + pkg));
            web.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(web);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open the Play Store: " + e.getMessage());
        }
    }

    /**
     * Opens a web link in the phone's browser, or in the app that owns it (a
     * video-session link opens BetterHelp, say), for a link in a task's notes
     * (Anna, Oct 19 2026). The web app can't do this itself: the WebView keeps
     * every web page inside the app (MainActivity.launchExternalScheme hands
     * out only sms:/tel:/mailto:/geo:). Web links only.
     */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "");
        android.net.Uri uri;
        try {
            uri = android.net.Uri.parse(url == null ? "" : url.trim());
        } catch (Exception e) {
            call.reject("Not a link");
            return;
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(java.util.Locale.US);
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            call.reject("Only web links open here");
            return;
        }
        try {
            android.content.Intent view = new android.content.Intent(android.content.Intent.ACTION_VIEW, uri);
            view.addCategory(android.content.Intent.CATEGORY_BROWSABLE);
            view.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(view);
            call.resolve();
        } catch (Exception e) {
            Log.w(TAG, "openUrl: could not open the link", e);
            call.reject("Could not open the link: " + e.getMessage());
        }
    }

    /**
     * Google Play's own update screen, inside the app (InAppUpdate). Resolves
     * { result: "started" | "cancelled" | "none" | "unavailable" | "failed" };
     * the web app opens the Play Store page (openPlayStore) for anything but
     * "started". Builds before 1.3.12 don't have this.
     */
    @PluginMethod
    public void startAppUpdate(PluginCall call) {
        android.app.Activity activity = getActivity();
        if (activity == null) {
            JSObject ret = new JSObject();
            ret.put("result", "unavailable");
            call.resolve(ret);
            return;
        }
        InAppUpdate.start(activity, outcome -> {
            JSObject ret = new JSObject();
            ret.put("result", outcome);
            call.resolve(ret);
        });
    }

    /** Request POST_NOTIFICATIONS permission (required for Android 13+) */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        try {
            OneSignal.getNotifications().requestPermission(true, new Continuation<Boolean>() {
                @NotNull
                @Override
                public CoroutineContext getContext() {
                    return EmptyCoroutineContext.INSTANCE;
                }

                @Override
                public void resumeWith(@NotNull Object result) {
                    // `result` is the granted Boolean, or a kotlin.Result.Failure if the
                    // coroutine threw. Previously this was discarded, so the web app could
                    // not tell a granted permission from a denied one.
                    boolean granted = (result instanceof Boolean) && (Boolean) result;
                    JSObject response = new JSObject();
                    response.put("granted", granted);
                    Log.d(TAG, "requestPermission: granted=" + granted);
                    call.resolve(response);
                }
            });
        } catch (Exception e) {
            call.reject("Failed to request permission: " + e.getMessage());
        }
    }

    /**
     * Returns the data payload of the notification that opened the app (cold
     * start), then clears it so the popup only fires once. Returns an empty
     * object when the app was not opened from a notification.
     */
    @PluginMethod
    public void getLaunchNotification(PluginCall call) {
        try {
            JSObject result = new JSObject();
            if (lastLaunchNotificationData != null) {
                JSObject notification = new JSObject();
                notification.put("data", toJSObject(lastLaunchNotificationData));
                result.put("notification", notification);
                // Clear so it only triggers once per launch
                lastLaunchNotificationData = null;
            }
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to get launch notification: " + e.getMessage());
        }
    }

    private String getPlayerId() {
        String id = OneSignal.getUser().getOnesignalId();
        if (id == null || id.isEmpty()) {
            IPushSubscription sub = OneSignal.getUser().getPushSubscription();
            if (sub != null) id = sub.getId();
        }
        return id != null ? id : "";
    }
}