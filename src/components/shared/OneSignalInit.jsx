import { useEffect } from 'react';

// Helper function to detect if running in Capacitor mobile app
function isRunningInCapacitor() {
    return window !== window.parent;
}

export default function OneSignalInit({ user }) {
  useEffect(() => {
    const syncOneSignal = async () => {
      if (!user) {
        console.log('[OneSignal] No user provided to OneSignalInit');
        return;
      }

      const userEmail = user?.email;

      // CRITICAL: Verify we have an email, not an ID
      if (!userEmail || !userEmail.includes('@')) {
        console.error('[OneSignal] INVALID EMAIL:', userEmail);
        console.error('[OneSignal] User object:', user);
        return;
      }

      console.log('[OneSignal] ✅ Valid email confirmed:', userEmail);
      console.log('[OneSignal] User ID (NOT being sent):', user.id);

      if (isRunningInCapacitor()) {
        // Running in mobile app - send to native wrapper
        console.log('[OneSignal] Running in Capacitor mobile app');
        
        if (userEmail) {
          // User logged in - set external user ID via postMessage
          console.log('[OneSignal] ✅ Sending EMAIL (not ID) via postMessage:', userEmail);
          console.log('[OneSignal] ❌ NOT sending user ID:', user.id);
          
          window.parent.postMessage({
            type: 'setOneSignalExternalUserId',
            externalUserId: userEmail // ALWAYS the email, NEVER user.id
          }, '*');
        } else {
          // User logged out
          console.log('[OneSignal] User logged out in mobile app');
          window.parent.postMessage({
            type: 'oneSignalLogout'
          }, '*');
        }
      } else {
        // Running in web browser - use web SDK
        console.log('[OneSignal] Running in web browser');
        
        if (userEmail) {
          // Initialize OneSignal web SDK
          window.OneSignal = window.OneSignal || [];
          window.OneSignal.push(function() {
            window.OneSignal.init({
              appId: "dc1933bc-e49e-4d8a-aa4a-2c9ca749ff37",
              allowLocalhostAsSecureOrigin: true
            });
            
            // FIXED: Use SDK 5.x login() method instead of deprecated setExternalUserId()
            console.log('[OneSignal] ✅ Web SDK using login() with EMAIL:', userEmail);
            window.OneSignal.login(userEmail);
          });
        } else {
          // FIXED: Use SDK 5.x logout() method instead of deprecated removeExternalUserId()
          if (window.OneSignal) {
            window.OneSignal.push(function() {
              window.OneSignal.logout();
              console.log('[OneSignal] Web SDK logged out');
            });
          }
        }
      }
    };

    syncOneSignal();
  }, [user]);

  return null;
}