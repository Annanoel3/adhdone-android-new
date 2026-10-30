import UIKit
import Capacitor
import ADHDoneNative

/// The app's one screen: Capacitor's WebView showing adhdone.space, with
/// ADHDone's own native plugins registered on it (Main.storyboard points here).
/// Same plugin names and methods as the Android app, so the web app does not
/// care which phone it is on. What isn't here yet is listed in IOS_PLAN.md.
class ADHDoneViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NotifyBridge())
        bridge?.registerPluginInstance(CalendarBridge())
        bridge?.registerPluginInstance(RecorderBridge())
        bridge?.registerPluginInstance(BillingBridge())
        bridge?.registerPluginInstance(ContactPickerBridge())
    }
}
