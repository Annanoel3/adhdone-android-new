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
  // Toll roads: true = avoid them, false = takes them, undefined = never
  // asked. Google's fastest route is often the toll road, so a "leave now"
  // timed on it runs late for someone who won't take it. Asked the moment a
  // work address goes in (and once for anyone who already had one).
  const [avoidTolls, setAvoidTolls] = useState(undefined);
  const [tollsSaving, setTollsSaving] = useState(false);

  useEffect(() => { setAddress(user?.work_address || ''); }, [user]);
  useEffect(() => {
    setAvoidTolls(typeof user?.commute_avoid_tolls === 'boolean' ? user.commute_avoid_tolls : undefined);
  }, [user]);

  const saveTolls = async (value) => {
    setTollsSaving(true);
    try {
      await base44.auth.updateMe({ commute_avoid_tolls: value });
      setAvoidTolls(value);
      onSaved?.();
    } finally {
      setTollsSaving(false);
    }
  };

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
          Where you commute to.
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
        ) : null}
        {address && avoidTolls === undefined ? (
          <div className="mt-3">
            <p className={`text-sm font-medium ${dark ? 'text-gray-100' : 'text-gray-800'}`}>
              Do you take toll roads?
            </p>
            <p className={`text-xs mt-1 mb-2 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
              Your "time to leave" alert is timed on the route you'd actually drive.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={tollsSaving} onClick={() => saveTolls(false)}>
                Yes, I take tolls
              </Button>
              <Button size="sm" variant="outline" disabled={tollsSaving} onClick={() => saveTolls(true)}>
                No, avoid tolls
              </Button>
            </div>
          </div>
        ) : null}
        {address && avoidTolls !== undefined ? (
          <p className={`mt-2 text-xs ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
            {avoidTolls ? 'Timed on toll-free routes.' : 'Timed on the fastest route, tolls included.'}{' '}
            <button type="button" onClick={() => setAvoidTolls(undefined)} className="underline">
              Change
            </button>
          </p>
        ) : null}
        {!address ? (
          <>
            <Input
              value={typing}
              onChange={(e) => setTyping(e.target.value)}
              placeholder="Address or place name (e.g. City Hall)"
              className={`mb-2 ${dark ? 'bg-gray-700 text-white border-gray-600' : ''}`}
              disabled={saving}
            />
            <LocationSuggestions query={typing} theme={theme} onPick={save} />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}