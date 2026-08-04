import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';

// Persist the OneSignal subscription/player ID to the user record so the
// backend can deliver pushes by include_player_ids (per-device, reliable).
async function savePlayerId(playerId) {
  if (!playerId) return;
  try {
    await base44.functions.invoke('saveMyPlayerId', { playerId });
    console.log('[OneSignal] ✅ Saved player ID:', playerId);
  } catch (err) {
    console.error('[OneSignal] Failed to save player ID:', err);
  }
}

// Helper function to detect if running in Capacitor mobile app
function isRunningInCapacitor() {
    return window.Capacitor?.isNativePlatform?.() ?? false;
}

// Handle incoming notification data and route to the correct in-app screen
function handleNotificationData(data, navigate) {
  if (!data) return;
  const taskId = data.taskId || data.task_id;
  if (!taskId) return;

  // Birthday notifications open the task directly so the user can draft/send the text
  const isBirthdayType = data.type === 'birthday_reminder' || data.type === 'birthday_text_reminder';
  if (isBirthdayType && data.screen && navigate) {
    navigate(`${data.screen}?taskId=${taskId}`);
    return;
  }

  // Other notifications: dispatch event for modal-based follow-up
  sessionStorage.setItem('pending_task_followup', taskId);
  window.dispatchEvent(new CustomEvent('show-task-followup', { detail: { taskId } }));
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
          const loginResult = await NotifyBridge.login({ externalId: externalId });
          // Native plugin returns the player ID synchronously — save it.
          if (loginResult?.playerId) {
            await savePlayerId(loginResult.playerId);
          } else {
            // Fallback: fetch it explicitly if login didn't return it.
            try {
              const idResult = await NotifyBridge.getPlayerId?.();
              if (idResult?.playerId) await savePlayerId(idResult.playerId);
            } catch (e) {
              console.warn('[OneSignal] Could not retrieve native player ID:', e);
            }
          }
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

            // Persist the push subscription ID to the backend so pushes
            // can be delivered by include_player_ids (per-device).
            const syncWebSubscriptionId = () => {
              const subId = window.OneSignal.User?.PushSubscription?.id;
              if (subId) savePlayerId(subId);
            };
            syncWebSubscriptionId();
            window.OneSignal.User?.PushSubscription?.addEventListener?.('change', syncWebSubscriptionId);

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