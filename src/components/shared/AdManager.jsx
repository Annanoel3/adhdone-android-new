import { useEffect, useState, useRef } from 'react';
import { initAdMob, showInterstitialAd, resetAdLaunchState } from '@/lib/admob';

const AD_OPEN_KEY = 'admgr_open_count';
const LAST_LAUNCH_KEY = 'admgr_last_launch_at';
// Coming back after this long away counts as a fresh launch. Android keeps
// frequently-used apps alive in memory, so cold starts alone were rare enough
// that qualifying launches almost never came around.
const NEW_LAUNCH_GAP_MS = 30 * 60 * 1000;

function isCapacitor() {
  return window.Capacitor?.isNativePlatform?.() ?? false;
}

function isUserBusy() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag)) return true;
  if (el.isContentEditable || el.contentEditable === 'true') return true;
  if (window.__microphoneActive) return true;
  if (document.querySelector('[data-mic-active="true"]')) return true;
  return false;
}

function shouldShowAd(count) {
  if (count === 2) return true;
  if (count > 2 && (count - 2) % 3 === 0) return true;
  return false;
}

export default function AdManager() {
  const [countdown, setCountdown] = useState(null);
  const delayRef = useRef(null);
  const countRef = useRef(null);

  useEffect(() => {
    if (!isCapacitor()) return;
    initAdMob().catch(() => {});

    function clearTimers() {
      if (delayRef.current) clearTimeout(delayRef.current);
      if (countRef.current) clearInterval(countRef.current);
      delayRef.current = null;
      countRef.current = null;
    }

    function tryShowAd() {
      if (isUserBusy()) {
        delayRef.current = setTimeout(tryShowAd, 5000);
        return;
      }
      let c = 5;
      setCountdown(c);
      countRef.current = setInterval(() => {
        // Cancel if the user became busy (e.g. started recording) mid-countdown
        if (isUserBusy()) {
          clearInterval(countRef.current);
          setCountdown(null);
          delayRef.current = setTimeout(tryShowAd, 30000);
          return;
        }
        c -= 1;
        if (c <= 0) {
          clearInterval(countRef.current);
          setCountdown(null);
          showInterstitialAd().catch(() => {});
        } else {
          setCountdown(c);
        }
      }, 1000);
    }

    // Counts a launch at most once per gap window, so route changes (which
    // remount this component) never inflate the count.
    function registerLaunch() {
      const lastRaw = localStorage.getItem(LAST_LAUNCH_KEY);
      const lastMs = lastRaw ? parseInt(lastRaw, 10) : 0;
      if (Date.now() - lastMs < NEW_LAUNCH_GAP_MS) return;

      localStorage.setItem(LAST_LAUNCH_KEY, String(Date.now()));
      const count = parseInt(localStorage.getItem(AD_OPEN_KEY) || '0', 10) + 1;
      localStorage.setItem(AD_OPEN_KEY, String(count));

      resetAdLaunchState();
      clearTimers();
      setCountdown(null);
      if (!shouldShowAd(count)) return;
      delayRef.current = setTimeout(tryShowAd, 30000);
    }

    registerLaunch();

    let handle = null;
    (async () => {
      try {
        const { App } = window.Capacitor.Plugins;
        handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) registerLaunch();
        });
      } catch (e) {}
    })();

    return () => {
      clearTimers();
      handle?.remove?.();
    };
  }, []);

  if (countdown === null) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '80px',
      right: '12px',
      background: 'rgba(0,0,0,0.55)',
      color: '#fff',
      padding: '3px 7px',
      borderRadius: '4px',
      fontSize: '10px',
      zIndex: 9999,
      pointerEvents: 'none',
      letterSpacing: '0.02em',
    }}>
      Ad in {countdown}...
    </div>
  );
}