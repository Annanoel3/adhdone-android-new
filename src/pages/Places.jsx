import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import HomeBaseFields from '@/components/settings/HomeBaseFields';
import WorkAddressCard from '@/components/places/WorkAddressCard';
import ScheduleCard from '@/components/places/ScheduleCard';
import WorkQuietCard from '@/components/places/WorkQuietCard';
import RemoteWorkCard from '@/components/places/RemoteWorkCard';
import PlacesPrivacyNote from '@/components/places/PlacesPrivacyNote';
import { base44 } from '@/api/base44Client';

export default function Places() {
  const [user, setUser] = useState(null);
  const theme = localStorage.getItem('adhd_theme') || 'minimalist';
  const dark = theme === 'dark';

  const load = async () => {
    try { setUser(await base44.auth.me()); } catch (e) {}
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6 pb-24">
      <div>
        <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>Places</h1>
        <p className={`text-sm mt-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
          The addresses you go between, and when you need to be there. This is what lets me say
          "leave now" with an actual drive time behind it instead of a guess.
        </p>
      </div>

      <PlacesPrivacyNote theme={theme} />

      <Card className={`border-none shadow-lg ${dark ? 'bg-gray-800' : 'bg-white'}`}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 text-base ${dark ? 'text-white' : ''}`}>
            <MapPin className="w-5 h-5" />
            Home base
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-sm mb-4 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
            Where you usually start from. No GPS, no tracking — just an address you type once.
          </p>
          <HomeBaseFields user={user} theme={theme} onSaved={load} />
        </CardContent>
      </Card>

      <RemoteWorkCard user={user} theme={theme} onSaved={load} />
      {!user?.work_remote && <WorkAddressCard user={user} theme={theme} onSaved={load} />}
      <ScheduleCard user={user} theme={theme} />
      <WorkQuietCard user={user} theme={theme} />
    </div>
  );
}