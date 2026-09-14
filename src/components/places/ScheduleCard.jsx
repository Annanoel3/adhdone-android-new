import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarClock } from 'lucide-react';
import FixedWeekEditor from './FixedWeekEditor';
import ShiftWeekEditor from './ShiftWeekEditor';
import { base44 } from '@/api/base44Client';

// Two very different realities: a schedule that's the same every week, and one
// that's posted week by week (retail/service). Neither is an edge case, so the
// user picks which one they live in and gets an editor built for it.
export default function ScheduleCard({ user, theme }) {
  const [mode, setMode] = useState('fixed');

  useEffect(() => { setMode(user?.work_schedule_mode || 'fixed'); }, [user]);

  const dark = theme === 'dark';

  const pick = (m) => {
    setMode(m);
    base44.auth.updateMe({ work_schedule_mode: m }).catch(() => {});
  };

  return (
    <Card className={`border-none shadow-lg ${dark ? 'bg-gray-800' : 'bg-white'}`}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 text-base ${dark ? 'text-white' : ''}`}>
          <CalendarClock className="w-5 h-5" />
          Your schedule
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={mode === 'fixed' ? 'default' : 'outline'}
            onClick={() => pick('fixed')}
            className={mode === 'fixed' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
          >
            Same every week
          </Button>
          <Button
            variant={mode === 'varies' ? 'default' : 'outline'}
            onClick={() => pick('varies')}
            className={mode === 'varies' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
          >
            Changes weekly
          </Button>
        </div>

        {mode === 'fixed' ? (
          <FixedWeekEditor user={user} theme={theme} />
        ) : (
          <ShiftWeekEditor theme={theme} />
        )}
      </CardContent>
    </Card>
  );
}