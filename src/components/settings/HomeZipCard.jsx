import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import HomeBaseFields from './HomeBaseFields';

export default function HomeZipCard({ user, theme }) {
  const navigate = useNavigate();

  return (
    <Card className={`mb-6 border-none shadow-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
          <MapPin className="w-5 h-5" />
          Home Base
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          Optional. Your starting point for two things: telling you when to actually leave for
          something (based on real drive time and traffic), and grouping errands that are near
          each other into one trip. No exact address, no tracking — just a circle over your general area.
        </p>
        <HomeBaseFields user={user} theme={theme} />
        <Button variant="outline" onClick={() => navigate('/Places')} className="w-full">
          Work address &amp; schedule
          <ArrowRight className="w-4 h-4" />
        </Button>
      </CardContent>
    </Card>
  );
}