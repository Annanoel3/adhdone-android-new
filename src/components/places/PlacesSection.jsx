import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import HomeBaseFields from '@/components/settings/HomeBaseFields';
import WorkAddressCard from '@/components/places/WorkAddressCard';
import ScheduleCard from '@/components/places/ScheduleCard';
import WorkQuietCard from '@/components/places/WorkQuietCard';
import RemoteWorkCard from '@/components/places/RemoteWorkCard';
import PlacesPrivacyNote from '@/components/places/PlacesPrivacyNote';

// Places is a Settings section since Nov 2 2026 (Anna: "we can move places
// into settings"): /settings?section=places, a row in Settings' Account list.
// /Places redirects here, so the commute push (screen '/Places') and any old
// link still land on it. The cards are the ones the Places page had, in the
// same order; the home circle lives only here now (it used to show on
// Personalization too).
export default function PlacesSection({ user, theme, onSaved }) {
  const dark = theme === 'dark';

  return (
    <div className="space-y-6 mb-6">
      <PlacesPrivacyNote theme={theme} />

      <Card id="home-base" className={`border-none shadow-lg ${dark ? 'bg-gray-800' : 'bg-white'}`}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 text-base ${dark ? 'text-white' : ''}`}>
            <MapPin className="w-5 h-5" />
            Home base
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-sm mb-4 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
            Where you usually start from. Just a circle over your general area — no exact address, no tracking.
          </p>
          <HomeBaseFields user={user} theme={theme} onSaved={onSaved} />
        </CardContent>
      </Card>

      <RemoteWorkCard user={user} theme={theme} onSaved={onSaved} />
      {!user?.work_remote && <WorkAddressCard user={user} theme={theme} onSaved={onSaved} />}
      <div id="work-hours"><ScheduleCard user={user} theme={theme} /></div>
      <WorkQuietCard user={user} theme={theme} />
    </div>
  );
}
