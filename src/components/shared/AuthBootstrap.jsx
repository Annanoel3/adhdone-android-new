import { useEffect } from 'react';
import { User } from "@/entities/User";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Capacitor } from '@capacitor/core';

// --- IMPORT ONESIGNAL FROM THE CAPACITOR PACKAGE ---
import OneSignal from 'onesignal-capacitor';

// Get the custom plugin you created in Android Studio
const { Notify } = Capacitor.Plugins;

export default function AuthBootstrap() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // This assumes OneSignal is initialized elsewhere in your app's startup,
    // for example: OneSignal.initialize("YOUR_ONESIGNAL_APP_ID");
    checkAuth();
  }, [location.pathname]);

  const checkAuth = async () => {
    // Prevent infinite auth loops
    if (location.pathname === createPageUrl("AuthCallback")) {
      return;
    }

    try {
      const user = await User.me();
    
      // This is the full, correct flow for the native app
      if (Capacitor.isNativePlatform() && user?.email) {
        try {
          // --- THE CRUCIAL FIX ---
          // Use the imported 'OneSignal' object, NOT 'window.OneSignal'
          await OneSignal.login(user.email);
          console.log("[OneSignal] login call to native SDK has been made for:", user.email);
          
          // 2. Call your native plugin to trigger the test reminder
          await Notify.sendTestReminder({ email: user.email });
          console.log("[OneSignal] Test reminder sent via native plugin to", user.email);

        } catch (err) {
          console.warn("[OneSignal] The native login/reminder flow failed.", err);
        }
      }
      
      // User is authenticated - ensure we're not stuck on a login page
      if (location.pathname.includes('/login') || location.pathname.includes('/auth')) {
        navigate(createPageUrl("Home"));
      }
    } catch (error) {
      console.log("User not authenticated, ignoring...");
      // Don't force redirect - let pages handle their own auth requirements
    }
  };

  return null;
}