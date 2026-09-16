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
            account. The map and map search run on OpenStreetMap, but your saved info never goes
            there. The only place it's sent is Google Maps, which gets your work address to suggest
            matches as you type and the spot you saved to time the drive, so "leave now" is a real
            time instead of a guess. When you first set your home circle, the app may ask for your
            general location so the map opens on your area, but where you actually are isn't stored
            nor tracked, only the spot where you drag the circle and press Save. No one else can see
            this info, it's never sold or shared, and you can change or clear it here any time.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}