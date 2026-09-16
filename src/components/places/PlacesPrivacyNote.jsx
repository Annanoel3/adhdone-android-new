import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldCheck } from 'lucide-react';

// Plain-language account of what actually happens to an address typed here:
// it's stored on the user's own profile, and the only time it leaves is a
// Google Maps lookup for suggestions and drive times. No GPS, no tracking.
export default function PlacesPrivacyNote({ theme }) {
  const dark = theme === 'dark';

  return (
    <Card className={`border-none shadow-lg ${dark ? 'bg-gray-800' : 'bg-white'}`}>
      <CardContent className="pt-6 flex items-start gap-3">
        <ShieldCheck className={`w-5 h-5 mt-0.5 flex-shrink-0 ${dark ? 'text-green-400' : 'text-green-600'}`} />
        <div className="flex-1 space-y-1.5">
          <p className={`font-medium text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>
            Your places stay yours
          </p>
          <p className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
            Nothing here tracks your phone. Your home circle and work address are saved to your own
            account, and the only time they leave the app is a Google Maps lookup — to fill in
            address suggestions as you type, and to measure the drive so "leave now" is a real time
            instead of a guess. The map may ask for your location once, only to open near you —
            that position is never saved.
          </p>
          <p className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
            No one else can see them, they're never sold or shared, and you can clear or change them
            here any time.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}