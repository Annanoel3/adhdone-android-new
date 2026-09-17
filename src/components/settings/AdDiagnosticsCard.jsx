import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Megaphone } from 'lucide-react';
import { showInterstitialAd, resetAdLaunchState, getLastAdStatus } from '@/lib/admob';

// Owner-only diagnostics: ad failures are silent by design (a failed ad must
// never interrupt the user), which made "I never see ads" impossible to debug.
export default function AdDiagnosticsCard({ user, theme }) {
  const [status, setStatus] = useState(getLastAdStatus());
  const [testing, setTesting] = useState(false);

  // Owner + admins only. The owner is matched by email too, since the account
  // role isn't always what the dashboard shows.
  const isOwner = user?.email === 's2kap2chick@gmail.com';
  if (user?.role !== 'admin' && !isOwner) return null;

  const runTest = async () => {
    setTesting(true);
    resetAdLaunchState();
    await showInterstitialAd().catch(() => {});
    setStatus(getLastAdStatus());
    setTesting(false);
  };

  return (
    <Card className={`mb-6 border-none shadow-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
          <Megaphone className="w-5 h-5" />
          Ad Diagnostics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-xs mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          Last ad attempt on this device:
        </p>
        <p className={`text-sm font-mono break-words mb-4 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
          {status}
        </p>
        <Button onClick={runTest} disabled={testing} variant="outline" className="w-full">
          {testing ? 'Requesting an ad...' : 'Try an ad right now'}
        </Button>
        <p className={`text-xs mt-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          Only works in the installed Android app, not the web preview.
        </p>
      </CardContent>
    </Card>
  );
}