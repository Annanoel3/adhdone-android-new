import { useEffect } from 'react';

export default function OneSignalInit({ user }) {
  useEffect(() => {
    // --- This is the correct, simple logic ---
    const syncOneSignal = async () => {      // Get our custom plugin from the global Capacitor object
      const NotifyBridge = window.Capacitor?.Plugins?.Notify;

      if (!NotifyBridge) {
        console.error('[OneSignal] Custom NotifyBridge plugin not found. Cannot sync user.');
        return;
      }

      if (user && user.email) {
        // --- Handle User Login ---
        console.log('[OneSignal] User logged in. Calling custom NotifyBridge.login()...');
        try {
          await NotifyBridge.login({ externalId: user.email });
          console.log('[OneSignal] Successfully called custom login for:', user.email);

          // Now we can call our test reminder
          await NotifyBridge.sendTestReminder({ email: user.email });

        } catch (e) {
          console.error('[OneSignal] Custom login failed:', e);
        }
      } else {
        // --- Handle User Logout ---
        console.log('[OneSignal] User logged out. Calling custom NotifyBridge.logout()...');
        try {
          await NotifyBridge.logout();
          console.log('[OneSignal] Successfully called custom logout.');
        } catch (e) {
          console.error('[OneSignal] Custom logout failed:', e);
        }
      }
    };

    syncOneSignal();
  }, [user]);

  return null;
}
