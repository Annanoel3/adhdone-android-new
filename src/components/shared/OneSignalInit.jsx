import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Helper function to detect if running in Capacitor mobile app
function isRunningInCapacitor() {
    return window.Capacitor?.isNativePlatform?.() ?? false;
}

// Handle incoming notification data and route to the correct in-app screen
function handleNotificationData(data, navigate) {
  if (!data) return;
  const taskId = data.taskId || data.task_id;
  const screen = data.screen;
  if (taskId && (screen === '/TaskNotification' || screen === 'TaskNotification')) {
    navigate(`/TaskNotification?taskId=${taskId}`);
  }
}

export default function OneSignalInit({ user }) {
  const navigate = useNavigate();

  // Handle notification-open deep links on app launch (native: from cold start data)
  useEffect(() => {
    // Check if app was opened via a notification (Capacitor)
    if (isRunningInCapacitor()) {
      const NotifyBridge = window.Capacitor?.Plugins?.NotifyBridge;
      if (NotifyBridge) {
        NotifyBridge.addListener?.('notificationOpened', (event) => {
          const data = event?.notification?.data || event?.data;
          handleNotificationData(data, navigate);
        });
        // Also check for launch notification
        NotifyBridge.getLaunchNotification?.().then((result) => {
          if (result?.notification?.data) {
            handleNotificationData(result.notification.data, navigate);
          }
        }).catch(() => {});
      }
    }
  }, [navigate]);

  useEffect(() => {
    const syncOneSignal = async () => {
      if (!user) {
        console.log('[OneSignal] No user provided to OneSignalInit');
        return;
      }

      const userEmail = user?.email;

      // Use real email if available, otherwise construct a fake one from user.id
      // (OneSignal requires email format for external ID)
      let externalId;
      if (userEmail && userEmail.includes('@')) {
        externalId = userEmail;
        console.log('[OneSignal] ✅ Using real email as external ID:', externalId);
      } else if (user?.id) {
        externalId = `${user.id}@adhdone.app`;
        console.log('[OneSignal] ⚠️ No email found, using generated ID:', externalId);
      } else {
        console.error('[OneSignal] No email or user ID available, skipping');
        return;
      }

      if (isRunningInCapacitor()) {
        // Running in Capacitor native app - call NotifyBridge plugin directly
        console.log('[OneSignal] Running in Capacitor mobile app');
        const NotifyBridge = window.Capacitor?.Plugins?.NotifyBridge;

        if (!NotifyBridge) {
          console.warn('[OneSignal] NotifyBridge plugin not found');
          return;
        }

        if (externalId) {
          console.log('[OneSignal] ✅ Calling NotifyBridge.login() with:', externalId);
          await NotifyBridge.requestPermission();
          await NotifyBridge.login({ externalId: externalId });
        } else {
          console.log('[OneSignal] Calling NotifyBridge.logout()');
          await NotifyBridge.logout();
        }
      } else {
        // Running in web browser - use web SDK
        console.log('[OneSignal] Running in web browser');
        
        if (externalId) {
          // Initialize OneSignal web SDK
          window.OneSignal = window.OneSignal || [];
          window.OneSignal.push(function() {
            window.OneSignal.init({
              appId: "dc1933bc-e49e-4d8a-aa4a-2c9ca749ff37",
              allowLocalhostAsSecureOrigin: true
            });

            console.log('[OneSignal] ✅ Web SDK using login() with:', externalId);
            window.OneSignal.login(externalId);

            // Handle notification clicks in web
            window.OneSignal.Notifications.addEventListener('click', (event) => {
              const data = event?.notification?.data;
              handleNotificationData(data, navigate);
            });
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