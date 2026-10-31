import { toast } from "@/components/ui/use-toast";
import { phonePlatform } from "@/lib/phonePlatform";

// Open a web link in the phone's own browser, not inside the app.
//
// The app's screen keeps every web page inside itself, so a plain link or
// window.open would just load the page in the app (or, on Android, a blank
// inner window). Android hands it out with NotifyBridge.openUrl (build 43 on);
// the iPhone app with NotifyBridge.openExternal. On an older Android build
// that can't, the link is copied so it can be pasted in the browser. On the
// plain website it opens in a new tab.
function copyLink(url) {
  const shown = url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (!navigator.clipboard?.writeText) {
    toast({ title: "Open this in your browser", description: shown });
    return;
  }
  navigator.clipboard.writeText(url)
    .then(() => toast({ title: "Link copied", description: `Paste it in your browser: ${shown}` }))
    .catch(() => toast({ title: "Open this in your browser", description: shown }));
}

export function openInBrowser(url) {
  if (!url) return;
  const platform = phonePlatform();
  const bridge = typeof window !== "undefined" ? window.Capacitor?.Plugins?.NotifyBridge : null;

  if (platform === "android") {
    if (bridge?.openUrl) {
      Promise.resolve(bridge.openUrl({ url })).catch(() => copyLink(url));
    } else {
      copyLink(url);
    }
    return;
  }

  if (platform === "ios") {
    if (bridge?.openExternal) {
      Promise.resolve(bridge.openExternal({ url })).catch(() => copyLink(url));
    } else {
      copyLink(url);
    }
    return;
  }

  window.open(url, "_blank", "noopener");
}
