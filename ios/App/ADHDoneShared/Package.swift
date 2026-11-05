// swift-tools-version: 5.9
import PackageDescription

// What every piece of the iPhone app shares: the app, the share extension, the
// notification extension (ADHDoneNotify) and the widget (ADHDoneWidget) all
// link this. No dependencies on purpose, so an extension can use it without
// dragging in Capacitor, OneSignal or RevenueCat.
//   SharedSession — the web app's sign-in, copied into a keychain group, and
//                   the server calls made with it (CaptureAPI)
//   SharedStore   — the small JSON blobs the targets pass each other (alarms,
//                   widget tasks, the chosen sounds, silence, choices to drain)
//   PushData      — reading a OneSignal push's data, and which buttons it gets
//   AlarmMetadata — the AlarmKit alarm's metadata type (app + widget)
let package = Package(
    name: "ADHDoneShared",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "ADHDoneShared", targets: ["ADHDoneShared"])
    ],
    targets: [
        .target(
            name: "ADHDoneShared",
            path: "Sources/ADHDoneShared"
        )
    ]
)
