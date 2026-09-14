import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { BellOff } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Once the app knows when someone is on shift, it can stop poking them there.
// Only the soft stuff goes quiet — a reminder tied to a real moment still lands,
// because silencing those is how people miss things.
export default function WorkQuietCard({ user, theme }) {
  const [on, setOn] = useState(false);
  const dark = theme === 'dark';

  useEffect(() => { setOn(!!user?.work_quiet_enabled); }, [user]);

  const toggle = (value) => {
    setOn(value);
    base44.auth.updateMe({ work_quiet_enabled: value }).catch(() => {});
  };

  return (
    <Card className={`border-none shadow-lg ${dark ? 'bg-gray-800' : 'bg-white'}`}>
      <CardContent className="pt-6 flex items-start gap-3">
        <BellOff className={`w-5 h-5 mt-0.5 flex-shrink-0 ${dark ? 'text-gray-300' : 'text-gray-600'}`} />
        <div className="flex-1">
          <p className={`font-medium text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>
            Don't send me notifications at work
          </p>
          <p className={`text-xs mt-1 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
            Nudges, check-ins and daily summaries stay quiet while you're on shift. Reminders tied to
            a specific time still come through — add an end time to each work day so I know when
            you're off.
          </p>
        </div>
        <Switch checked={on} onCheckedChange={toggle} />
      </CardContent>
    </Card>
  );
}