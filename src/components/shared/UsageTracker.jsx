import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { track, trackFire, setTrackedEmail, newSessionId } from '@/lib/appTrack';

// A return after this long away is a new visit (Anna, Nov 1 2026: opens were
// logged only when the app started fresh, so a phone that kept ADHDone in the
// background showed days of use as one visit). The same 30 minutes AdManager
// uses to count an open.
const NEW_VISIT_MS = 30 * 60 * 1000;

// Measures how long the app actually stays open, which screens get used, and
// catches every unhandled error the app throws. Renders nothing.
//
// Session length is counted as FOREGROUND time only: the timer pauses when the
// app is backgrounded (on a phone, "still open" would otherwise mean "sitting
// in the app switcher for nine hours").
export default function UsageTracker({ user }) {
  const location = useLocation();
  const startedRef = useRef(null);
  const activeSecondsRef = useRef(0);
  const reportedRef = useRef(false);
  const hiddenAtRef = useRef(null);

  useEffect(() => {
    if (user?.email) setTrackedEmail(user.email);
  }, [user?.email]);

  useEffect(() => {
    startedRef.current = Date.now();
    track('session_start');

    const accumulate = () => {
      if (startedRef.current) {
        activeSecondsRef.current += (Date.now() - startedRef.current) / 1000;
        startedRef.current = null;
      }
    };

    const endSession = () => {
      if (reportedRef.current) return;
      accumulate();
      if (activeSecondsRef.current < 1) return;
      reportedRef.current = true;
      track('session_end', { seconds: activeSecondsRef.current });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Backgrounding a phone app is where sessions really end — pagehide
        // often never fires, so the duration is written here.
        endSession();
        hiddenAtRef.current = Date.now();
      } else {
        const away = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
        hiddenAtRef.current = null;
        startedRef.current = Date.now();
        reportedRef.current = false;
        if (away >= NEW_VISIT_MS) {
          // Back after a long time away: a new visit, with its own id, its own
          // length and the page it opened on.
          newSessionId();
          activeSecondsRef.current = 0;
          track('session_start', { props: { resumed: true, away_seconds: Math.round(away / 1000) } });
          trackFire('page_view');
        }
        // Otherwise it's a new measurable stretch of the same session.
      }
    };

    const onError = (e) => {
      trackFire('app_error', {
        props: {
          message: String(e?.message || 'unknown').slice(0, 300),
          source: String(e?.filename || '').slice(0, 200),
          line: e?.lineno || null,
        },
      });
    };

    const onRejection = (e) => {
      const reason = e?.reason;
      trackFire('app_error', {
        props: {
          message: String(reason?.message || reason || 'unhandled rejection').slice(0, 300),
          kind: 'promise',
        },
      });
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', endSession);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', endSession);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  useEffect(() => {
    trackFire('page_view');
  }, [location.pathname]);

  return null;
}