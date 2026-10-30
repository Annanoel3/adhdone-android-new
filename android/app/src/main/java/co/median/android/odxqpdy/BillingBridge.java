package co.median.android.odxqpdy;

import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.revenuecat.purchases.CustomerInfo;
import com.revenuecat.purchases.EntitlementInfo;
import com.revenuecat.purchases.Offering;
import com.revenuecat.purchases.Offerings;
import com.revenuecat.purchases.Package;
import com.revenuecat.purchases.PurchaseParams;
import com.revenuecat.purchases.Purchases;
import com.revenuecat.purchases.PurchasesConfiguration;
import com.revenuecat.purchases.PurchasesError;
import com.revenuecat.purchases.interfaces.LogInCallback;
import com.revenuecat.purchases.interfaces.PurchaseCallback;
import com.revenuecat.purchases.interfaces.ReceiveCustomerInfoCallback;
import com.revenuecat.purchases.interfaces.ReceiveOfferingsCallback;
import com.revenuecat.purchases.models.PricingPhase;
import com.revenuecat.purchases.models.StoreProduct;
import com.revenuecat.purchases.models.StoreTransaction;
import com.revenuecat.purchases.models.SubscriptionOption;

import java.util.Date;
import java.util.Map;

/**
 * In-app purchases through RevenueCat (Google Play Billing underneath), copied
 * from Happy Plants' working bridge (Oct 25 2026). ADHDone sells packs of
 * recording minutes for the Notes page (notes_1h, notes_5h): consumables, which
 * RevenueCat consumes automatically because they are marked Consumable in the
 * RevenueCat dashboard. The server (Base44 function recordingMinutes) credits
 * the minutes after re-reading the purchase from RevenueCat, so nothing here
 * decides what anyone owns.
 * Debug builds use RevenueCat's Test Store key; release builds use the Google Play key.
 * Keys come from android/local.properties (never committed):
 *   revenuecat.testKey=test_...
 *   revenuecat.googleKey=goog_...
 * A release build without a goog_ key reports billing as unavailable instead of
 * shipping test purchases to real users.
 */
@CapacitorPlugin(name = "BillingBridge")
public class BillingBridge extends Plugin {

    private static final String TAG = "BillingBridge";

    private String apiKey() {
        return BuildConfig.DEBUG ? BuildConfig.RC_TEST_KEY : BuildConfig.RC_GOOGLE_KEY;
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject r = new JSObject();
        String key = apiKey();
        r.put("available", key != null && !key.isEmpty());
        r.put("testStore", BuildConfig.DEBUG);
        call.resolve(r);
    }

    /** Configure once with the signed-in user's id; switch users with logIn. */
    @PluginMethod
    public void configure(PluginCall call) {
        String userId = call.getString("appUserId");
        String key = apiKey();
        if (key == null || key.isEmpty()) { call.reject("billing_unavailable"); return; }
        if (userId == null || userId.isEmpty()) { call.reject("appUserId is required"); return; }
        try {
            if (!Purchases.Companion.isConfigured()) {
                Purchases.Companion.configure(
                    new PurchasesConfiguration.Builder(getContext().getApplicationContext(), key)
                        .appUserID(userId)
                        .build());
                Purchases.Companion.getSharedInstance().getCustomerInfo(customerInfoCallback(call));
            } else if (!userId.equals(Purchases.Companion.getSharedInstance().getAppUserID())) {
                Purchases.Companion.getSharedInstance().logIn(userId, new LogInCallback() {
                    @Override public void onReceived(CustomerInfo info, boolean created) { call.resolve(infoJson(info)); }
                    @Override public void onError(PurchasesError error) { call.reject(error.getMessage()); }
                });
            } else {
                Purchases.Companion.getSharedInstance().getCustomerInfo(customerInfoCallback(call));
            }
        } catch (Exception e) {
            Log.e(TAG, "configure failed", e);
            call.reject("configure failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getOfferings(PluginCall call) {
        if (!Purchases.Companion.isConfigured()) { call.reject("not_configured"); return; }
        Purchases.Companion.getSharedInstance().getOfferings(new ReceiveOfferingsCallback() {
            @Override public void onReceived(Offerings offerings) {
                JSObject r = new JSObject();
                Offering current = offerings.getCurrent();
                JSArray pkgs = new JSArray();
                if (current != null) {
                    r.put("offeringId", current.getIdentifier());
                    for (Package p : current.getAvailablePackages()) pkgs.put(packageJson(p));
                }
                r.put("packages", pkgs);
                call.resolve(r);
            }
            @Override public void onError(PurchasesError error) { call.reject(error.getMessage()); }
        });
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String packageId = call.getString("packageId");
        if (!Purchases.Companion.isConfigured()) { call.reject("not_configured"); return; }
        Purchases.Companion.getSharedInstance().getOfferings(new ReceiveOfferingsCallback() {
            @Override public void onReceived(Offerings offerings) {
                Offering current = offerings.getCurrent();
                Package chosen = null;
                if (current != null) {
                    for (Package p : current.getAvailablePackages()) {
                        if (p.getIdentifier().equals(packageId)) { chosen = p; break; }
                    }
                }
                if (chosen == null) { call.reject("package_not_found"); return; }
                Purchases.Companion.getSharedInstance().purchase(
                    new PurchaseParams.Builder(getActivity(), chosen).build(),
                    new PurchaseCallback() {
                        @Override public void onCompleted(StoreTransaction tx, CustomerInfo info) {
                            JSObject r = infoJson(info);
                            r.put("cancelled", false);
                            call.resolve(r);
                        }
                        @Override public void onError(PurchasesError error, boolean userCancelled) {
                            if (userCancelled) {
                                JSObject r = new JSObject();
                                r.put("cancelled", true);
                                call.resolve(r);
                            } else {
                                call.reject(error.getMessage());
                            }
                        }
                    });
            }
            @Override public void onError(PurchasesError error) { call.reject(error.getMessage()); }
        });
    }

    @PluginMethod
    public void restore(PluginCall call) {
        if (!Purchases.Companion.isConfigured()) { call.reject("not_configured"); return; }
        Purchases.Companion.getSharedInstance().restorePurchases(customerInfoCallback(call));
    }

    @PluginMethod
    public void getCustomerInfo(PluginCall call) {
        if (!Purchases.Companion.isConfigured()) { call.reject("not_configured"); return; }
        Purchases.Companion.getSharedInstance().getCustomerInfo(customerInfoCallback(call));
    }

    // ---------- helpers ----------

    private ReceiveCustomerInfoCallback customerInfoCallback(PluginCall call) {
        return new ReceiveCustomerInfoCallback() {
            @Override public void onReceived(CustomerInfo info) { call.resolve(infoJson(info)); }
            @Override public void onError(PurchasesError error) { call.reject(error.getMessage()); }
        };
    }

    private static String iso(Date d) {
        if (d == null) return null;
        java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US);
        f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        return f.format(d);
    }

    /** Any active entitlement counts as Plus, so the dashboard's entitlement name doesn't matter. */
    private JSObject infoJson(CustomerInfo info) {
        JSObject r = new JSObject();
        boolean active = false;
        if (info != null) {
            r.put("appUserId", info.getOriginalAppUserId());
            Map<String, EntitlementInfo> act = info.getEntitlements().getActive();
            for (EntitlementInfo e : act.values()) {
                active = true;
                r.put("entitlement", e.getIdentifier());
                r.put("productId", e.getProductIdentifier());
                r.put("expiresAt", iso(e.getExpirationDate()));
                r.put("willRenew", e.getWillRenew());
                r.put("sandbox", e.isSandbox());
                break;
            }
            if (info.getManagementURL() != null) r.put("manageUrl", info.getManagementURL().toString());
        }
        r.put("active", active);
        return r;
    }

    private JSObject packageJson(Package p) {
        JSObject o = new JSObject();
        StoreProduct prod = p.getProduct();
        o.put("id", p.getIdentifier());
        o.put("type", p.getPackageType().name());
        o.put("productId", prod.getId());
        o.put("title", prod.getTitle());
        o.put("price", prod.getPrice().getFormatted());
        o.put("priceMicros", prod.getPrice().getAmountMicros());
        o.put("currency", prod.getPrice().getCurrencyCode());
        if (prod.getPeriod() != null) o.put("period", prod.getPeriod().getIso8601());
        if (prod.getSubscriptionOptions() != null) {
            SubscriptionOption trial = prod.getSubscriptionOptions().getFreeTrial();
            if (trial != null && trial.getFreePhase() != null) {
                o.put("freeTrial", trial.getFreePhase().getBillingPeriod().getIso8601());
            }
            SubscriptionOption intro = prod.getSubscriptionOptions().getIntroOffer();
            if (intro != null && intro.getIntroPhase() != null) {
                PricingPhase ph = intro.getIntroPhase();
                JSObject io = new JSObject();
                io.put("price", ph.getPrice().getFormatted());
                io.put("period", ph.getBillingPeriod().getIso8601());
                io.put("cycles", ph.getBillingCycleCount());
                o.put("introOffer", io);
            }
        }
        return o;
    }
}
