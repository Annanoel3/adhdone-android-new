import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Zap } from 'lucide-react';

const getPlugins = () => {
  const p = (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins) || {};
  return { ShareBridge: p.ShareBridge, NotifyBridge: p.NotifyBridge };
};

export default function QuickCaptureCard({ theme }) {
  const { ShareBridge, NotifyBridge } = getPlugins();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ShareBridge?.isQuickCaptureEnabled) return;
    ShareBridge.isQuickCaptureEnabled()
      .then((res) => setEnabled(!!res?.enabled))
      .catch(() => {});
  }, [ShareBridge]);

  if (!ShareBridge?.setQuickCaptureEnabled) return null;

  const handleToggle = async (next) => {
    setBusy(true);
    setError('');
    try {
      if (next && NotifyBridge?.requestPermission) {
        await NotifyBridge.requestPermission();
      }
      const res = await ShareBridge.setQuickCaptureEnabled({ enabled: next });
      setEnabled(!!res?.enabled);
      if (next && !res?.enabled) {
        setError(
          res?.reason === 'permission'
            ? 'Notifications are blocked for ADHDone. Turn them on in your phone settings to use quick capture.'
            : "Couldn't turn on quick capture. Try again."
        );
      }
    } catch (e) {
      setError("Couldn't turn on quick capture. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={`mb-6 border-none shadow-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
          <Zap className="w-5 h-5" />
          Quick Capture
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="pr-4">
            <p className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
              Pinned capture notification
            </p>
            <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Keeps a shortcut in your notification tray so you can dump a task from anywhere.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={handleToggle} disabled={busy} />
        </div>
        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
      </CardContent>
    </Card>
  );
}