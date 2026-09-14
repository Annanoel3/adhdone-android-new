import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import HomeBaseFields from './HomeBaseFields';

export default function HomeZipCard({ user, theme }) {
  return (
    <Card className={`mb-6 border-none shadow-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
          <MapPin className="w-5 h-5" />
          Home Base
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-sm mb-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          Optional. Your starting point for two things: telling you when to actually leave for
          something (based on real drive time and traffic), and grouping errands that are near
          each other into one trip. No GPS, no tracking — just a fixed address you type in
          once. Leave it blank if you'd rather not.
        </p>
        <HomeBaseFields user={user} theme={theme} />
      </CardContent>
    </Card>
  );
}