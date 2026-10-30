// swift-tools-version: 5.9
import PackageDescription

// ADHDone's own native pieces for iPhone, as one Swift package the app links:
//   NotifyBridge   — push notifications (OneSignal)
//   CalendarBridge — the phone's calendars (EventKit)
//   RecorderBridge — the Record Notes recorder (AVAudioRecorder, keeps going in the background)
//   BillingBridge  — packs of Record Notes minutes (RevenueCat / StoreKit)
//   ContactPickerBridge — Apple's contact picker (a birthday's phone number)
// Same plugin names and methods as the Android app, so the web app does not
// care which phone it is on.
let package = Package(
    name: "ADHDoneNative",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "ADHDoneNative", targets: ["ADHDoneNative"])
    ],
    dependencies: [
        // Any Capacitor 8: CapApp-SPM pins the exact one `npx cap sync` installed.
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", "8.0.0"..<"9.0.0"),
        .package(url: "https://github.com/OneSignal/OneSignal-XCFramework.git", from: "5.2.0"),
        .package(url: "https://github.com/RevenueCat/purchases-ios-spm.git", from: "5.0.0")
    ],
    targets: [
        .target(
            name: "ADHDoneNative",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "OneSignalFramework", package: "OneSignal-XCFramework"),
                .product(name: "RevenueCat", package: "purchases-ios-spm")
            ],
            path: "Sources/ADHDoneNative",
            // Apple's privacy manifest: the recorder reads the clock since boot
            // (to time a recording) and a recording file's size.
            resources: [.copy("PrivacyInfo.xcprivacy")]
        )
    ]
)
