import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.median.android.odxqpdy',
  appName: 'ADHDone',
  webDir: 'dist',
  server: {
    url: 'https://adhdone.space',
    // The page the iPhone app shows when adhdone.space can't load (no signal):
    // public/offline.html, copied into the app by the Codemagic build. Android
    // shows its own page (MainActivity) and doesn't use this.
    errorPath: 'offline.html',
    cleartext: false,
    androidScheme: 'https',
    allowNavigation: [
      '*.base44.app',
      'base44.app',
      'accounts.google.com',
      '*.google.com',
      'adhdone.space',
      // Sign in with Apple (App Store guideline 4.8) opens Apple's page in the app.
      'appleid.apple.com',
      'idmsa.apple.com',
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#ffffff',
      showSpinner: false,
      androidSplashResourceName: 'splash',
    },
    StatusBar: {
      style: 'DEFAULT',
      backgroundColor: '#ffffff',
    },
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  // The iPhone app (ios/, built on Codemagic; see IOS_PLAN.md). Same WebView on
  // adhdone.space; the native pieces are in ios/App/ADHDoneNative.
  ios: {
    contentInset: 'automatic',
    // Google's sign-in page refuses "embedded" browsers; a Safari-like agent is
    // what the Android shell does too (it strips the "; wv" marker).
    overrideUserAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 ADHDone',
  },
};

export default config;
