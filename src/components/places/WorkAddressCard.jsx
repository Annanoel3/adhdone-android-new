import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Briefcase, Check } from 'lucide-react';
import LocationSuggestions from '@/components/tasks/LocationSuggestions';
import { base44 } from '@/api/base44Client';

export default function WorkAddressCard({ user, theme, onSaved }) {
  const [address, setAddress] = useState('');
  const [typing, setTyping] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setAddress(user?.work_address || ''); }, [user]);

  const dark = theme === 'dark';

  const save = async (value) => {
    setSaving(true);
    try {
      await base44.auth.updateMe({ work_address: value });
      setAddress(value);
      setTyping('');
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={`border-none shadow-lg ${dark ? 'bg-gray-800' : 'bg-white'}`}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 text-base ${dark ? 'text-white' : ''}`}>
          <Briefcase className="w-5 h-5" />
          Work
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-sm mb-3 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
          Where you commute to. Needs to be a real address — drive time to "work" isn't a thing.
        </p>
        {address ? (
          <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
            dark ? 'bg-gray-700 text-gray-100' : 'bg-teal-50 text-gray-800'
          }`}>
            <Check className="w-4 h-4 mt-0.5 flex-shrink-0 text-teal-600" />
            <span className="flex-1 break-words">{address}</span>
            <button type="button" onClick={() => save('')} className="text-xs underline flex-shrink-0">
              Change
            </button>
          </div>
        ) : (
          <>
            <Input
              value={typing}
              onChange={(e) => setTyping(e.target.value)}
              placeholder="Start typing your work address"
              className={`mb-2 ${dark ? 'bg-gray-700 text-white border-gray-600' : ''}`}
              disabled={saving}
            />
            <LocationSuggestions query={typing} theme={theme} onPick={save} />
          </>
        )}
      </CardContent>
    </Card>
  );
}