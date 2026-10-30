import Foundation
import Capacitor
import RevenueCat

/// BillingBridge — packs of Record Notes minutes on iPhone, through RevenueCat
/// (StoreKit underneath). Same contract as the Android BillingBridge, so
/// lib/minutePacks.js works unchanged (notes_1h, notes_5h: consumables, marked
/// Consumable in RevenueCat, which finishes them so they can be bought again):
///
///   await B.isAvailable()               -> { available, testStore }
///   await B.configure({ appUserId })    -> { ok }          (Base44 user id = RevenueCat app user id)
///   await B.getOfferings()              -> { packages: [{ id, productId, type, period, price, title, freeTrial }] }
///   await B.purchase({ packageId })     -> { cancelled } | { pending } | { active, productId, expiresAt }
///   await B.restore()                   -> { active }
///   await B.getCustomerInfo()           -> { active, productIds }
///
/// The RevenueCat public iOS key is read from Info.plist (RCAppleApiKey), which the
/// Codemagic build fills from its RC_APPLE_KEY variable, so the key is never in git.
/// The server (functions/recordingMinutes, fed by RevenueCat's webhook) credits the
/// minutes after re-reading the purchase; the phone only starts purchases.
@objc(BillingBridge)
public class BillingBridge: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BillingBridge"
    public let jsName = "BillingBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getOfferings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCustomerInfo", returnType: CAPPluginReturnPromise)
    ]

    private static var configuredFor: String?

    private static func apiKey() -> String {
        return ((Bundle.main.object(forInfoDictionaryKey: "RCAppleApiKey") as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        let key = BillingBridge.apiKey()
        call.resolve(["available": !key.isEmpty, "testStore": key.hasPrefix("test_")])
    }

    @objc func configure(_ call: CAPPluginCall) {
        let key = BillingBridge.apiKey()
        guard !key.isEmpty else { call.reject("no_key"); return }
        guard let userId = call.getString("appUserId"), !userId.isEmpty else { call.reject("appUserId is required"); return }
        DispatchQueue.main.async {
            if !Purchases.isConfigured {
                Purchases.logLevel = .warn
                Purchases.configure(with: Configuration.Builder(withAPIKey: key).with(appUserID: userId).build())
                BillingBridge.configuredFor = userId
                call.resolve(["ok": true])
            } else if BillingBridge.configuredFor != userId {
                Purchases.shared.logIn(userId) { _, _, error in
                    if let error = error { call.reject(error.localizedDescription); return }
                    BillingBridge.configuredFor = userId
                    call.resolve(["ok": true])
                }
            } else {
                call.resolve(["ok": true])
            }
        }
    }

    private func ensureConfigured(_ call: CAPPluginCall) -> Bool {
        if !Purchases.isConfigured { call.reject("not_configured"); return false }
        return true
    }

    @objc func getOfferings(_ call: CAPPluginCall) {
        guard ensureConfigured(call) else { return }
        Purchases.shared.getOfferings { offerings, error in
            if let error = error { call.reject(error.localizedDescription); return }
            let packages = offerings?.current?.availablePackages ?? []
            let rows: [[String: Any]] = packages.map { p in
                let product = p.storeProduct
                var type = "CUSTOM"
                switch p.packageType {
                case .monthly: type = "MONTHLY"
                case .annual: type = "ANNUAL"
                case .weekly: type = "WEEKLY"
                case .sixMonth: type = "SIX_MONTH"
                case .threeMonth: type = "THREE_MONTH"
                case .twoMonth: type = "TWO_MONTH"
                case .lifetime: type = "LIFETIME"
                default: type = "CUSTOM"
                }
                var period = ""
                if let sp = product.subscriptionPeriod {
                    let unit: String
                    switch sp.unit {
                    case .day: unit = "D"
                    case .week: unit = "W"
                    case .month: unit = "M"
                    case .year: unit = "Y"
                    @unknown default: unit = "M"
                    }
                    period = "P\(sp.value)\(unit)"
                }
                let intro = product.introductoryDiscount
                let freeTrial = intro != nil && intro?.paymentMode == .freeTrial
                return [
                    "id": p.identifier,
                    "productId": product.productIdentifier,
                    "type": type,
                    "period": period,
                    "price": product.localizedPriceString,
                    // Sorting the packs cheapest first (minutePacks.loadPacks), same as Android.
                    "priceMicros": Int((NSDecimalNumber(decimal: product.price).doubleValue * 1_000_000).rounded()),
                    "title": product.localizedTitle,
                    "freeTrial": freeTrial,
                    "freeTrialText": freeTrial ? (intro?.subscriptionPeriod.debugDescription ?? "") : ""
                ]
            }
            call.resolve(["packages": rows, "offeringId": offerings?.current?.identifier ?? ""])
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard ensureConfigured(call) else { return }
        guard let packageId = call.getString("packageId"), !packageId.isEmpty else { call.reject("packageId is required"); return }
        Purchases.shared.getOfferings { offerings, error in
            if let error = error { call.reject(error.localizedDescription); return }
            guard let pkg = offerings?.current?.availablePackages.first(where: { $0.identifier == packageId })
                    ?? offerings?.all.values.flatMap({ $0.availablePackages }).first(where: { $0.identifier == packageId }) else {
                call.reject("no_such_package")
                return
            }
            Purchases.shared.purchase(package: pkg) { _, customerInfo, error, cancelled in
                if cancelled { call.resolve(["cancelled": true]); return }
                if let error = error as NSError? {
                    if error.code == ErrorCode.paymentPendingError.rawValue { call.resolve(["pending": true]); return }
                    call.reject(error.localizedDescription)
                    return
                }
                call.resolve(BillingBridge.summary(customerInfo))
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        guard ensureConfigured(call) else { return }
        Purchases.shared.restorePurchases { customerInfo, error in
            if let error = error { call.reject(error.localizedDescription); return }
            call.resolve(BillingBridge.summary(customerInfo))
        }
    }

    @objc func getCustomerInfo(_ call: CAPPluginCall) {
        guard ensureConfigured(call) else { return }
        Purchases.shared.getCustomerInfo { customerInfo, error in
            if let error = error { call.reject(error.localizedDescription); return }
            call.resolve(BillingBridge.summary(customerInfo))
        }
    }

    private static func summary(_ info: CustomerInfo?) -> [String: Any] {
        let ids = Array(info?.activeSubscriptions ?? [])
        let entitlement = info?.entitlements.active.values.first
        let f = ISO8601DateFormatter()
        return [
            "active": !ids.isEmpty || entitlement != nil,
            "productIds": ids,
            "productId": entitlement?.productIdentifier ?? ids.first ?? "",
            "expiresAt": entitlement?.expirationDate.map { f.string(from: $0) } ?? ""
        ]
    }
}
