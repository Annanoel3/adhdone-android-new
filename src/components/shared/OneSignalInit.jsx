import { useEffect } from 'react';

// Helper function to detect if running in Capacitor mobile app
function isRunningInCapacitor() {
    return window.parent !== window && window.parent.Capacitor !== undefined;
}

export default function OneSignalInit({ user }) {
  useEffect(() => {
    const syncOneSignal = async () => {
      const userEmail = user?.email;

      if (isRunningInCapacitor()) {
        // Running in mobile app - send to native wrapper
        console.log('[OneSignal] Running in Capacitor mobile app');
        
        if (userEmail) {
          // User logged in - set external user ID via postMessage
          console.log('[OneSignal] Setting external user ID via postMessage:', userEmail);
          window.parent.postMessage({
            type: 'setOneSignalExternalUserId',
            externalUserId: userEmail
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
            
            // Set external user ID
            window.OneSignal.setExternalUserId(userEmail);
            console.log('[OneSignal] Web SDK initialized with external user ID:', userEmail);
          });
        } else {
          // User logged out - remove external user ID
          if (window.OneSignal) {
            window.OneSignal.push(function() {
              window.OneSignal.removeExternalUserId();
              console.log('[OneSignal] Removed external user ID from web SDK');
            });
          }
        }
      }
    };

    syncOneSignal();
  }, [user]);

  return null;
}