import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

export default function OneSignalInit({ user }) {
    const lastSuccessRef = useRef(null);
    const watcherRef = useRef(null);
    const pendingEmailRef = useRef(null);

    useEffect(() => {
        // --- helpers defined inside effect to close over refs ---

        function getNotifyBridge() {
            if (!window.Capacitor) return null;
            // Check already-registered global first
            const existing = window.NotifyBridge || window.Capacitor?.Plugins?.NotifyBridge;
            if (existing && typeof existing.login === 'function') return existing;
            // Try registering via Capacitor 7+ API
            if (window.Capacitor.registerPlugin) {
                try {
                    const registered = window.Capacitor.registerPlugin('NotifyBridge');
                    if (registered && typeof registered.login === 'function') {
                        window.NotifyBridge = registered;
                        return registered;
                    }
                } catch (e) {}
            }
            return null;
        }

        function startWatcher() {
            if (watcherRef.current) return;
            console.log('[OneSignal] NotifyBridge not ready yet, polling...');
            watcherRef.current = setInterval(() => {
                const bridge = getNotifyBridge();
                if (bridge && pendingEmailRef.current) {
                    clearInterval(watcherRef.current);
                    watcherRef.current = null;
                    attemptLogin(pendingEmailRef.current);
                }
            }, 500);
        }

        function attemptLogin(email) {
            const bridge = getNotifyBridge();
            if (!bridge) {
                startWatcher();
                return;
            }
            console.log('[OneSignal] Calling NotifyBridge.login() with:', email);
            bridge.login({ externalId: email })
                .then((response) => {
                    console.log('[OneSignal] ✅ External ID set:', email, '| playerId:', response?.playerId);
                    lastSuccessRef.current = email;
                    pendingEmailRef.current = null;
                    // Save player ID to the database so backend can target this device
                    const playerId = response?.playerId;
                    if (playerId) {
                        base44.functions.invoke('saveMyPlayerId', { playerId })
                            .catch(err => console.warn('[OneSignal] saveMyPlayerId failed:', err));
                    }
                })
                .catch((err) => {
                    console.warn('[OneSignal] login() failed, will retry:', err);
                    startWatcher();
                });
        }

        // --- main logic ---

        const isNative = !!window.Capacitor?.isNativePlatform?.();
        const email = user?.email;
        const emailValid = email && email.includes('@');

        if (!emailValid) {
            // User logged out — clean up
            pendingEmailRef.current = null;
            if (isNative) {
                const bridge = getNotifyBridge();
                if (bridge?.logout) {
                    bridge.logout().catch(() => {});
                }
            } else if (window.OneSignal?.push) {
                window.OneSignal.push(() => window.OneSignal.logout?.());
            }
            return;
        }

        if (isNative) {
            if (email === lastSuccessRef.current) {
                console.log('[OneSignal] External ID already set for:', email);
                return;
            }
            pendingEmailRef.current = email;
            attemptLogin(email);
        } else {
            // Web browser — use OneSignal web SDK
            window.OneSignal = window.OneSignal || [];
            window.OneSignal.push(function () {
                window.OneSignal.init({
                    appId: 'dc1933bc-e49e-4d8a-aa4a-2c9ca749ff37',
                    allowLocalhostAsSecureOrigin: true,
                });
                console.log('[OneSignal] Web SDK login() with:', email);
                window.OneSignal.login(email);
            });
        }

        return () => {
            if (watcherRef.current) {
                clearInterval(watcherRef.current);
                watcherRef.current = null;
            }
        };
    }, [user]);

    return null;
}