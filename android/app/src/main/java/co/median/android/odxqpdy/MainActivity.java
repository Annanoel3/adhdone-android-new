package co.median.android.odxqpdy;

import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.net.Uri;
import android.util.Log;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

import java.net.URLDecoder;
import java.util.Locale;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "ADHDone";

    private String lastLoadedUrl = null;
    private boolean isShowingOfflinePage = false;
    // onRenderProcessGone: how often the page has been rebuilt after the
    // WebView's renderer died, so a renderer that dies on every rebuild
    // doesn't turn into an endless reload.
    private long lastRendererRestart = 0L;
    private int rendererRestarts = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register plugins BEFORE super.onCreate() so Capacitor picks them up
        registerPlugin(NotifyBridge.class);
        registerPlugin(ShareBridge.class);
        registerPlugin(ContactPickerBridge.class);
        registerPlugin(WidgetBridge.class);
        registerPlugin(AlarmBridge.class);
        registerPlugin(CalendarBridge.class);
        registerPlugin(RecorderBridge.class);
        registerPlugin(BillingBridge.class); // recording-minute packs (RevenueCat)
        super.onCreate(savedInstanceState);
        setupInAppNavigation();
        // Cold start: the app may have been launched by a share or a quick-capture reply
        handleIncomingIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        // Warm start (launchMode=singleTask): share / quick-capture reply while already running
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    // Whether the app is on screen right now. AlarmService opens the alarm screen
    // directly when it is (a background app may not; it relies on the full-screen
    // intent then).
    private static volatile boolean foreground = false;

    static boolean isInForeground() {
        return foreground;
    }

    @Override
    public void onPause() {
        foreground = false;
        super.onPause();
    }

    @Override
    public void onResume() {
        super.onResume();
        foreground = true;

        // Restore the pinned quick-capture notification on ANY app open. The equivalent
        // reconcile in ShareBridge.isQuickCaptureEnabled() only runs when the web app calls
        // it, which in practice is just the settings screen — so opening the app normally
        // never brought the notification back after One UI's "Clear all" removed it.
        if (QuickCapture.isEnabled(this)) {
            if (!QuickCapture.isVisible(this)) {
                Log.d(TAG, "onResume: quick-capture notification missing, re-posting");
                QuickCapture.post(this);
            }
            // Idempotent (KEEP): re-arms the periodic keep-alive if it was ever lost.
            QuickCapture.scheduleKeepAlive(this);
        }

        // Refresh the native copy of the base44 session so captures can be sent while the
        // app is closed, and drain anything that was queued in the meantime.
        if (bridge != null) {
            SessionSnapshotter.schedule(this, bridge.getWebView());
        }
        if (CaptureQueue.size(this) > 0) {
            CaptureSyncWorker.kick(this);
        }

        // Play's in-app update, if one was started here and then left (InAppUpdate).
        InAppUpdate.resumeIfNeeded(this);
    }

    /**
     * Pulls text out of an incoming intent — either a text/plain share, or a quick-capture
     * notification reply — and hands it to the web app via ShareBridge. Extras are removed
     * afterwards so the same text is not redelivered if the activity is recreated.
     */
    private void handleIncomingIntent(Intent intent) {
        if (intent == null) {
            return;
        }

        // "Done" on a reminder notification: that notification goes away now
        // (the task's page, opened below, finishes the task).
        int cancelId = intent.getIntExtra(TaskActions.EXTRA_CANCEL_NOTIFICATION, 0);
        intent.removeExtra(TaskActions.EXTRA_CANCEL_NOTIFICATION);
        if (cancelId != 0) {
            TaskActions.cancelNotification(this, cancelId);
        }

        // Home-screen widget tap. Handled here rather than in a separate activity so the
        // running WebView is simply brought forward (launchMode=singleTask -> onNewIntent)
        // instead of the page reloading. WidgetBridge decides whether to emit the event now
        // or hold it for getPendingWidgetOpen() on a cold start.
        String widgetPath = intent.getStringExtra(WidgetBridge.EXTRA_WIDGET_PATH);
        intent.removeExtra(WidgetBridge.EXTRA_WIDGET_PATH);
        if (widgetPath != null && !widgetPath.isEmpty()) {
            Log.d(TAG, "handleIncomingIntent: widget tap -> " + widgetPath);
            WidgetBridge.deliverPath(widgetPath);
        }

        String text = null;

        String type = intent.getType();

        // Shared image. Unlike shared text — which CaptureActivity queues without ever
        // opening the app — an image has to come through here, because the WebView is what
        // uploads it and runs readImageCapture. SharedImageReader does the decode, downscale
        // and base64 on a background thread and then calls ShareBridge.deliverImage().
        if (Intent.ACTION_SEND.equals(intent.getAction())
                && type != null && type.startsWith("image/")) {
            Uri imageUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (imageUri != null) {
                Log.d(TAG, "handleIncomingIntent: shared image received");
                SharedImageReader.deliverAsync(this, imageUri);
            }
            // Prevent redelivery if the activity is recreated.
            intent.removeExtra(Intent.EXTRA_STREAM);
            return;
        }

        if (Intent.ACTION_SEND.equals(intent.getAction())
                && type != null && type.startsWith("text/plain")) {
            String shared = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (shared != null) {
                shared = shared.trim();
                String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
                // Chrome-style shares send the page title as the subject and a bare URL as
                // the text; keep the title so the task is readable.
                if (subject != null && !subject.trim().isEmpty() && isBareUrl(shared)) {
                    shared = subject.trim() + " " + shared;
                }
                text = shared;
            }
            intent.removeExtra(Intent.EXTRA_TEXT);
            intent.removeExtra(Intent.EXTRA_SUBJECT);
        }

        if (text == null || text.isEmpty()) {
            String captured = intent.getStringExtra(QuickCapture.EXTRA_CAPTURED_TEXT);
            if (captured != null) {
                text = captured.trim();
            }
            intent.removeExtra(QuickCapture.EXTRA_CAPTURED_TEXT);
        }

        if (text != null && !text.isEmpty()) {
            Log.d(TAG, "handleIncomingIntent: delivering " + text.length() + " chars");
            ShareBridge.deliver(text);
        }
    }

    /** True when the whole string is a single http(s) URL with no surrounding words. */
    private boolean isBareUrl(String value) {
        return value.matches("(?i)^https?://\\S+$");
    }

    /**
     * Hand non-web URL schemes to the device's apps.
     *
     * The WebView cannot load sms:/tel:/mailto:/geo: URLs. Previously
     * shouldOverrideUrlLoading returned false for everything, so the WebView tried to load
     * them itself and the tap silently did nothing — which is why the web app's birthday /
     * scheduled-text flow (src/components/utils/openSmsApp.js) never opened Messages.
     *
     * http(s) is deliberately not handled here: it keeps falling through to the existing
     * in-app navigation and the Capacitor bridge, unchanged.
     *
     * @return true when the URL was consumed (launched, or unlaunchable but definitely not
     *         something the WebView should try to load).
     */
    private boolean launchExternalScheme(String url) {
        if (url == null || url.isEmpty()) {
            return false;
        }

        Uri uri;
        String scheme;
        try {
            uri = Uri.parse(url);
            scheme = uri.getScheme();
        } catch (Exception e) {
            return false;
        }
        if (scheme == null) {
            return false;
        }
        scheme = scheme.toLowerCase(Locale.US);

        boolean isMessaging = "sms".equals(scheme) || "smsto".equals(scheme)
                || "mms".equals(scheme) || "mmsto".equals(scheme);
        boolean isMail = "mailto".equals(scheme);
        boolean isDial = "tel".equals(scheme);
        boolean isGeo = "geo".equals(scheme);

        if (!isMessaging && !isMail && !isDial && !isGeo) {
            return false; // http(s) and anything else: unchanged behaviour
        }

        // Messaging and mail are "send to this address" actions; dial and maps are views.
        Intent intent = new Intent(
                (isMessaging || isMail) ? Intent.ACTION_SENDTO : Intent.ACTION_VIEW, uri);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        // Some messaging apps (Samsung Messages among them) prefill from the sms_body extra
        // rather than the ?body= query parameter, so set both.
        if (isMessaging) {
            String body = extractQueryParam(uri, "body");
            if (body != null) {
                intent.putExtra("sms_body", body);
            }
        }

        try {
            startActivity(intent);
            Log.d(TAG, "launchExternalScheme: opened " + scheme + ": externally");
        } catch (ActivityNotFoundException e) {
            Log.w(TAG, "launchExternalScheme: no app handles " + scheme + ":");
        } catch (Exception e) {
            Log.w(TAG, "launchExternalScheme: failed to open " + scheme + ": " + e.getMessage());
        }
        // Consumed either way — letting the WebView attempt it only yields an error page.
        return true;
    }

    /**
     * Reads a query parameter from a possibly-opaque URI. Uri.getQueryParameter() throws on
     * opaque URIs such as "sms:+15551234?body=hi", so the scheme-specific part is parsed by
     * hand.
     */
    private String extractQueryParam(Uri uri, String key) {
        try {
            String ssp = uri.getSchemeSpecificPart();
            if (ssp == null) {
                return null;
            }
            int q = ssp.indexOf('?');
            if (q < 0) {
                return null;
            }
            for (String param : ssp.substring(q + 1).split("&")) {
                if (param.startsWith(key + "=")) {
                    return URLDecoder.decode(param.substring(key.length() + 1), "UTF-8");
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "extractQueryParam failed: " + e.getMessage());
        }
        return null;
    }

    private void setupInAppNavigation() {
        WebView webView = getBridge().getWebView();

        // Fix Google OAuth "disallowed_useragent" error by removing the WebView marker
        String ua = webView.getSettings().getUserAgentString();
        webView.getSettings().setUserAgentString(ua.replace("; wv", ""));

        // Enable multi-window so onCreateWindow fires for window.open() calls
        webView.getSettings().setSupportMultipleWindows(true);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(true);
        // Improve WebView performance and compatibility
        WebSettings settings = webView.getSettings();
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);


        final WebChromeClient originalChromeClient =
                (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                        ? webView.getWebChromeClient()
                        : null;

        // Intercept window.open() so auth flows stay in-app
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog,
                                          boolean isUserGesture, Message resultMsg) {
                Log.d(TAG, "onCreateWindow triggered");
                WebView tempView = new WebView(MainActivity.this);
                tempView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                        String url = request.getUrl().toString();
                        // An sms:/tel:/mailto: link opened via window.open or target=_blank
                        // must go to the external app, not be loaded into the WebView.
                        if (!launchExternalScheme(url)) {
                            webView.loadUrl(url);
                        }
                        return true;
                    }

                    @Override
                    @SuppressWarnings("deprecation")
                    public boolean shouldOverrideUrlLoading(WebView v, String url) {
                        if (!launchExternalScheme(url)) {
                            webView.loadUrl(url);
                        }
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(tempView);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView wv,
                                             ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams fileChooserParams) {
                if (originalChromeClient != null) {
                    return originalChromeClient.onShowFileChooser(wv, filePathCallback, fileChooserParams);
                }
                return super.onShowFileChooser(wv, filePathCallback, fileChooserParams);
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (originalChromeClient != null) {
                    originalChromeClient.onPermissionRequest(request);
                } else {
                    request.grant(request.getResources());
                }
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                if (originalChromeClient != null) {
                    return originalChromeClient.onConsoleMessage(consoleMessage);
                }
                return super.onConsoleMessage(consoleMessage);
            }
        });

        // Keep all navigation in-app (prevents Chrome from opening for auth)
        // Handle offline errors; track current URL for retry
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if (url != null && !url.startsWith("data:")) {
                    lastLoadedUrl = url;
                    isShowingOfflinePage = false;
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && !isShowingOfflinePage) {
                    isShowingOfflinePage = true;
                    String offlinePage = "<!DOCTYPE html><html><head>"
                        + "<meta name='viewport' content='width=device-width, initial-scale=1.0'>"
                        + "<style>*{box-sizing:border-box;margin:0;padding:0}"
                        + "body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f0f4f8;"
                        + "display:flex;align-items:center;justify-content:center;"
                        + "min-height:100vh;padding:24px;text-align:center}"
                        + ".card{background:#fff;border-radius:20px;padding:40px 28px;"
                        + "max-width:320px;box-shadow:0 4px 24px rgba(0,0,0,.08)}"
                        + ".icon{font-size:56px;margin-bottom:20px}"
                        + "h1{font-size:22px;font-weight:700;color:#1a1a2e;margin-bottom:12px}"
                        + "p{font-size:15px;color:#6b7280;line-height:1.6;margin-bottom:28px}"
                        + "button{background:#4f46e5;color:#fff;border:none;padding:14px 36px;"
                        + "border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;width:100%}"
                        + "</style></head><body><div class='card'>"
                        + "<div class='icon'>&#128246;</div>"
                        + "<h1>No Internet Connection</h1>"
                        + "<p>This app needs an internet connection to work. Check your signal and try again.</p>"
                        + "<button onclick='window.location.href=\"" + (lastLoadedUrl != null ? lastLoadedUrl : "/") + "\"'> Try Again</button>"
                        + "</div></body></html>";
                    view.loadData(offlinePage, "text/html", "UTF-8");
                }
            }

            /**
             * The WebView's renderer process died (out of memory, a WebView bug).
             * Left unhandled, Android kills the whole app on the spot — the person
             * sees a crash, and a renderer that dies again on the next open looks
             * like "it crashes every time I open it" (Anna, Oct 13 2026, a new
             * account on her S20 Ultra; the web app itself logged no error).
             * Rebuild the screen instead: recreate() runs Capacitor's onCreate
             * again, which makes a fresh WebView and loads the app. At most twice a
             * minute — if the renderer dies straight away each time, the old
             * behaviour (a real crash) is more honest than a reload loop.
             */
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                long now = System.currentTimeMillis();
                rendererRestarts = (now - lastRendererRestart < 60_000L) ? rendererRestarts + 1 : 1;
                lastRendererRestart = now;
                boolean crashed = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && detail != null && detail.didCrash();
                Log.e(TAG, "onRenderProcessGone: crashed=" + crashed + " restarts=" + rendererRestarts);
                if (rendererRestarts > 2) {
                    return false;
                }
                view.post(() -> {
                    try {
                        recreate();
                    } catch (Exception e) {
                        Log.e(TAG, "recreate after renderer loss failed: " + e.getMessage());
                    }
                });
                return true;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (launchExternalScheme(request.getUrl().toString())) {
                    return true;
                }
                return false;
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (launchExternalScheme(url)) {
                    return true;
                }
                return false;
            }
        });

        // Auto-reload when connection is restored
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null) {
            NetworkRequest networkReq = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build();
            cm.registerNetworkCallback(networkReq, new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    if (isShowingOfflinePage && lastLoadedUrl != null) {
                        isShowingOfflinePage = false;
                        runOnUiThread(() -> getBridge().getWebView().loadUrl(lastLoadedUrl));
                    }
                }
            });
        }
    }

    // Back navigation is owned by the @capacitor/app plugin, which registers an
    // OnBackPressedCallback on the dispatcher (predictive-back compatible) and emits the
    // "backButton" event to the web app's handler in Layout.jsx. The old onBackPressed()
    // override was removed: with targetSdk 36 predictive back is on by default, so it was
    // never called, and reinstating WebView.goBack() here would double-navigate.
}