import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Laptop } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Working from home means there's no drive to warn about — but the work HOURS
// still matter, because "don't poke me while I'm working" is just as true at a
// kitchen table. So remote turns off the commute half and keeps the schedule.
export default function RemoteWorkCard({ user, theme, onSaved }) {
  const [on, setOn] = useState(false);
  const dark = theme === 'dark';

  useEffect(() => { setOn(!!user?.work_remote); }, [user]);

  const toggle = (value) => {
    setOn(value);
    base44.auth.updateMe({ work_remote: value })
      .then(() => onSaved?.())
      .catch(() => {});
  };

  return (
    <Card className={`border-none shadow-lg ${dark ? 'bg-gray-800' : 'bg-white'}`}>
      <CardContent className="pt-6 flex items-start gap-3">
        <Laptop className={`w-5 h-5 mt-0.5 flex-shrink-0 ${dark ? 'text-gray-300' : 'text-gray-600'}`} />
        <div className="flex-1">
          <p className={`font-medium text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>
            I work remotely
          </p>
          <p className={`text-xs mt-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
            No work address, no "leave now" alerts. You can still set your hours below so the app
            knows when to leave you alone.
          </p>
        </div>
        <Switch checked={on} onCheckedChange={toggle} />
      </CardContent>
    </Card>
  );
}