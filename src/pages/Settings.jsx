import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { 
  Sun, 
  Moon, 
  Sparkles, 
  Settings as SettingsIcon,
  Bell,
  Shield,
  HelpCircle,
  Bug,
  LogOut,
  ArrowLeft,
  Info,
  User as UserIcon,
  UserCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import HomeZipCard from '@/components/settings/HomeZipCard';
import QuickCaptureCard, { AlarmCard } from '@/components/settings/QuickCaptureCard';
import { refreshAlarms } from '@/components/utils/widgetBridge';
import AdDiagnosticsCard from '@/components/settings/AdDiagnosticsCard';
import { Textarea } from '@/components/ui/textarea';
import VersionTap from '@/components/settings/VersionTap';
import showSaved from '@/components/utils/showSaved';
import { toast } from '@/components/ui/use-toast';


// The two things the welcome chat asks for — a name and a sentence about the
// person's life — editable any time. The about-me line is what the task parser
// reads when it judges how urgent something is (a gig, a shift, a client), so
// it is worth keeping current when life changes.
function AboutYouCard({ user, theme, onSaved }) {
  const dark = theme === 'dark';
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    setName(user?.preferred_name || user?.display_name || '');
    setAbout(user?.about_me || '');
  }, [user?.preferred_name, user?.display_name, user?.about_me]);

  const dirty = name.trim() !== (user?.preferred_name || user?.display_name || '').trim()
    || about.trim() !== (user?.about_me || '').trim();

  const save = async () => {
    const n = name.trim();
    const a = about.trim();
    if (!n) { setNote('A name is needed.'); return; }
    setSaving(true);
    setNote('');
    try {
      // The name IS the username (display_name), the same field the welcome
      // chat sets. The handle (@name1234) is left alone — it is minted once.
      await base44.auth.updateMe({ preferred_name: n, display_name: n, about_me: a });
      setNote(''); showSaved();
      if (onSaved) await onSaved();
    } catch (e) {
      setNote("Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={`mb-6 border-none shadow-lg ${dark ? 'bg-gray-800' : 'bg-white'}`}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-2 ${dark ? 'text-white' : ''}`}>
          <UserCircle className="w-5 h-5" />
          About you
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="about-you-name" className={dark ? 'text-gray-300' : ''}>What we call you</Label>
          <Input
            id="about-you-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { if (dirty && !saving) save(); }}
            maxLength={40}
            className={dark ? 'bg-gray-700 border-gray-600 text-white' : ''}
          />
          {user?.handle && (
            <p className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Your handle is @{user.handle}.</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="about-you-about" className={dark ? 'text-gray-300' : ''}>Anything ADHDone should know about you</Label>
          <Textarea
            id="about-you-about"
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            onBlur={() => { if (dirty && !saving) save(); }}
            rows={3}
            maxLength={500}
            placeholder='Your work, your schedule, what you juggle — e.g. "I play violin at weddings" or "I&apos;m a nurse on night shifts."'
            className={dark ? 'bg-gray-700 border-gray-600 text-white' : ''}
          />
          <p className={`text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
            ADHDone reads this every time it sorts a task, breaks one down, nudges you, or writes your notes — so the more real it is, the better it fits your life.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saving && <span className="text-sm text-gray-500">Saving…</span>}
          {note && <span className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{note}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  // Two sub-pages live at ?section=… (new page files can't be added from the
  // code editor): Personalization — what ADHDone knows about you — and
  // Reminders. They are rows in the Account list; the main page stays short
  // (Anna, Oct 3 2026).
  const location = useLocation();
  const section = new URLSearchParams(location.search).get('section');
  const SECTIONS = {
    personalization: {
      title: 'Personalization',
      blurb: 'What ADHDone knows about you. It reads this every time it sorts a task, breaks one down, nudges you, or writes your notes.',
    },
    reminders: { title: 'Reminders', blurb: 'When and how ADHDone gets your attention.' },
  };
  const page = SECTIONS[section] || null;
  useEffect(() => { window.scrollTo(0, 0); }, [section]);
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [specialMode, setSpecialMode] = useState(() => localStorage.getItem('special_mode') || 'normal');
  const [seasonalUnlocked, setSeasonalUnlocked] = useState(() => localStorage.getItem('seasonal_unlocked') === 'true');
  const [user, setUser] = useState(null);
  const [quietHoursStart, setQuietHoursStart] = useState(() => localStorage.getItem('quiet_hours_start') || '22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState(() => localStorage.getItem('quiet_hours_end') || '08:00');
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      // Sync theme from user profile (source of truth for cross-device persistence)
      if (currentUser.adhd_theme) {
        setTheme(currentUser.adhd_theme);
        localStorage.setItem('adhd_theme', currentUser.adhd_theme);
      }
      const userSpecialMode = currentUser.special_mode || 'normal';
      setSpecialMode(userSpecialMode);
      localStorage.setItem('special_mode', userSpecialMode);
      if (currentUser.seasonal_unlocked) {
        setSeasonalUnlocked(true);
        localStorage.setItem('seasonal_unlocked', 'true');
      }
      // Quiet hours live on the profile (source of truth) so the backend cron
      // can enforce them in the user's own timezone. Mirror to localStorage for
      // the client-side reminder scheduler.
      const enabled = currentUser.quiet_hours_enabled === true;
      setQuietHoursEnabled(enabled);
      localStorage.setItem('quiet_hours_enabled', enabled ? 'true' : 'false');
      if (currentUser.quiet_hours_start) {
        setQuietHoursStart(currentUser.quiet_hours_start);
        localStorage.setItem('quiet_hours_start', currentUser.quiet_hours_start);
      }
      if (currentUser.quiet_hours_end) {
        setQuietHoursEnd(currentUser.quiet_hours_end);
        localStorage.setItem('quiet_hours_end', currentUser.quiet_hours_end);
      }
    } catch (error) {
      console.error('Error loading user:', error);
    }
  };

  const saveThemeToProfile = async (newTheme, newSpecialMode, newSeasonalUnlocked) => {
    localStorage.setItem('adhd_theme', newTheme);
    localStorage.setItem('special_mode', newSpecialMode);
    localStorage.setItem('seasonal_unlocked', newSeasonalUnlocked ? 'true' : 'false');
    try {
      await base44.auth.updateMe({
        adhd_theme: newTheme,
        special_mode: newSpecialMode,
        seasonal_unlocked: newSeasonalUnlocked
      });
    } catch (e) {
      console.error('Failed to save theme to profile:', e);
    }
  };

  // The theme picker (Look and feel, top of the page). Each choice is its own
  // button — the old single button cycled through them blind. The shell is
  // told at once (adhd-theme-changed), so nothing reloads.
  const SEASON_LABELS = {
    kawaii: 'Kawaii ✨', halloween: 'Halloween 🎃', fall: 'Fall 🍂', harvest: 'Harvest 🦃', winter: 'Winter ❄️',
    christmas: 'Christmas 🎄', valentines: "Valentine's 💗", newyears: "New Year's 🎉", stpatricks: "St. Patrick's ☘️",
    fourthjuly: 'Fourth of July 🎆', summer: 'Summer ☀️', spring: 'Spring 🌸',
  };
  const seasonToday = getDateBasedMode();
  const chosenLook = specialMode === 'kawaii' ? 'kawaii' : specialMode !== 'normal' ? 'seasonal' : theme;
  const chooseTheme = (key) => {
    let nextTheme = 'minimalist';
    let nextMode = 'normal';
    if (key === 'seasonal') nextMode = seasonToday === 'normal' ? 'fall' : seasonToday;
    else if (key === 'kawaii') nextMode = 'kawaii';
    else nextTheme = key;
    setTheme(nextTheme);
    setSpecialMode(nextMode);
    saveThemeToProfile(nextTheme, nextMode, seasonalUnlocked);
    window.dispatchEvent(new CustomEvent('adhd-theme-changed', { detail: { theme: nextTheme, specialMode: nextMode } }));
  };
  const looks = [
    { key: 'minimalist', label: 'Light', icon: <Sun className="w-5 h-5" />, swatch: 'bg-gradient-to-br from-stone-50 to-stone-200 border-stone-300' },
    { key: 'dark', label: 'Dark', icon: <Moon className="w-5 h-5" />, swatch: 'bg-gradient-to-br from-gray-800 to-black border-gray-700 text-white' },
    { key: 'colorful', label: 'Colorful', icon: <Sparkles className="w-5 h-5" />, swatch: 'bg-gradient-to-br from-purple-200 via-orange-100 to-teal-200 border-purple-300' },
    { key: 'spicybrains', label: 'Spicy Brains ✨', icon: <Sparkles className="w-5 h-5" />, swatch: 'bg-gradient-to-r from-pink-300 via-yellow-200 to-cyan-300 border-cyan-400' },
    ...(seasonalUnlocked ? [
      { key: 'seasonal', label: SEASON_LABELS[seasonToday] || 'Seasonal', icon: <Sparkles className="w-5 h-5" />, swatch: 'bg-gradient-to-br from-orange-200 to-purple-300 border-orange-400' },
      { key: 'kawaii', label: 'Kawaii ✨', icon: <Sparkles className="w-5 h-5" />, swatch: 'bg-gradient-to-br from-pink-200 to-pink-300 border-pink-400' },
    ] : []),
  ];

  // A hoisted function, not a const arrow: seasonToday above calls it before
  // this line runs, and the const version crashed the page (white screen).
  function getDateBasedMode() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    if (month === 12 && day >= 20 && day <= 26) return 'christmas';
    if ((month === 12 && day >= 27) || (month === 1 && day <= 5)) return 'newyears';
    if (month === 2 && day >= 10 && day <= 16) return 'valentines';
    if (month === 3 && day >= 10 && day <= 20) return 'stpatricks';
    if (month === 7 && day >= 1 && day <= 7) return 'fourthjuly';
    // Same table as the Layout's: all of October is Halloween.
    if (month === 10 || (month === 11 && day === 1)) return 'halloween';
    if ((month === 3 && day >= 21) || month === 4 || month === 5) return 'spring';
    if (month === 6 || (month === 7 && day > 7) || month === 8) return 'summer';
    if (month === 11 && day >= 22 && day <= 26) return 'harvest';
    if (month === 9 || (month === 11 && day >= 2)) return 'fall';
    if (month === 12 && day <= 19) return 'winter';
    if ((month === 1 && day >= 6) || (month === 2 && (day < 10 || day > 16)) || (month === 3 && day < 10)) return 'winter';

    return 'normal';
  };

  const handleLogout = async () => {
    try {
      await base44.auth.logout();
      window.location.reload();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const [quietHoursSaving, setQuietHoursSaving] = useState(false);

  const handleQuietHoursChange = (startTime, endTime) => {
    setQuietHoursStart(startTime);
    setQuietHoursEnd(endTime);
  };

  // Persist quiet hours to the user profile (the source of truth the backend
  // cron reads), mirror to localStorage for the client-side scheduler, then
  // ask the backend to re-check queued notifications against the new window.
  const persistQuietHours = async (enabled, start, end) => {
    setQuietHoursSaving(true);
    localStorage.setItem('quiet_hours_enabled', enabled ? 'true' : 'false');
    localStorage.setItem('quiet_hours_start', start);
    localStorage.setItem('quiet_hours_end', end);
    try {
      await base44.auth.updateMe({
        quiet_hours_enabled: enabled,
        quiet_hours_start: start,
        quiet_hours_end: end
      });
      if (enabled) {
        await base44.functions.invoke('applyQuietHours', {
          quietStart: start,
          quietEnd: end
        });
      }
      // Full-screen alarms follow the same window: rebuild the phone's alarm
      // set so nothing booked inside the new quiet hours can ring.
      refreshAlarms().catch(() => {});
      return true;
    } catch (e) {
      console.error('Failed to save quiet hours:', e);
      toast({ title: "Couldn't save quiet hours", description: 'Check your connection and try again.', variant: 'destructive' });
      return false;
    } finally {
      setQuietHoursSaving(false);
    }
  };

  const handleQuietHoursToggle = async (enabled) => {
    setQuietHoursEnabled(enabled);
    await persistQuietHours(enabled, quietHoursStart, quietHoursEnd);
  };

  const handleQuietHoursSave = async () => {
    // "Saved" only when it did save (the failure has its own message).
    if (await persistQuietHours(quietHoursEnabled, quietHoursStart, quietHoursEnd)) showSaved();
  };

  const settingsItems = [
    {
      icon: UserCircle,
      label: 'Personalization',
      onClick: () => navigate('/settings?section=personalization')
    },
    {
      icon: Bell,
      label: 'Reminders',
      onClick: () => navigate('/settings?section=reminders')
    },
    {
      icon: UserIcon,
      label: 'My Account',
      onClick: () => navigate('/myaccount')
    },
    // My Profile, Privacy Policy and Terms live on My Account now (Anna, Oct 3
    // 2026) — the list here stays short.
    {
      icon: Info,
      label: 'About ADHDone',
      onClick: () => navigate('/About')
    }
  ];

  return (
    <div className={`min-h-screen p-4 md:p-8 ${
      theme === 'dark' ? 'bg-gray-900' : theme === 'spicybrains' ? 'bg-gradient-to-br from-pink-300 to-yellow-300' : 'bg-gradient-to-br from-stone-50 via-sage-50 to-stone-100'
    }`} style={{ paddingBottom: 'max(2rem, calc(2rem + env(safe-area-inset-bottom)))' }}>
      <div className="max-w-2xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate(page ? '/settings' : '/')}
          className="gap-2 p-3 h-12 text-base rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          {page ? 'Settings' : 'Back'}
        </Button>

        <div className="mb-8">
          <h1 className={`text-3xl font-bold mb-2 ${
            theme === 'dark' ? 'text-white' : 'text-gray-900'
          }`}>
            {page ? page.title : 'Settings'}
          </h1>
          <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            {page ? page.blurb : 'Customize your ADHDone experience'}
          </p>
        </div>

        {!page && (<>
        {/* Feedback first: a direct line to the developer for anything at all. */}
        <Card className={`mb-6 border-none shadow-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
          <CardContent className="pt-6 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Talk to the developer</p>
              <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Feature requests, bugs, questions, or anything at all — it goes straight to Anna.</p>
            </div>
            <Button onClick={() => navigate('/reportbug')} className="flex-shrink-0 gap-2 bg-purple-600 hover:bg-purple-700 text-white">
              <Bug className="w-4 h-4" /> Feedback
            </Button>
          </CardContent>
        </Card>

        <p className={`text-xs font-bold uppercase tracking-wider mt-2 mb-3 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Look and feel</p>
        {/* Theme Section */}
        <Card className={`mb-6 border-none shadow-lg ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        }`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
              <Sparkles className="w-5 h-5" />
              Theme
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {looks.map((l) => {
                const on = chosenLook === l.key;
                return (
                  <button
                    key={l.key}
                    type="button"
                    onClick={() => chooseTheme(l.key)}
                    aria-pressed={on}
                    className={`relative rounded-2xl border-2 p-4 text-left transition-all ${l.swatch} ${
                      on ? 'ring-4 ring-purple-500 ring-offset-2 scale-[1.02]' : 'opacity-90 hover:opacity-100'
                    } ${theme === 'dark' ? 'ring-offset-gray-800' : 'ring-offset-white'}`}
                  >
                    <div className={`flex items-center gap-2 font-semibold ${l.key === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {l.icon}
                      <span>{l.label}</span>
                    </div>
                    {on && (
                      <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('adhd-theme-changed', { detail: { explainSpicy: true } }))}
              className={`mt-3 text-xs underline ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}
            >
              Why the Spicy Brains colors?
            </button>
          </CardContent>
        </Card>

        </>)}

        {section === 'personalization' && (<>
        <AboutYouCard user={user} theme={theme} onSaved={loadUser} />
        <HomeZipCard user={user} theme={theme} />
        </>)}

        {section === 'reminders' && (<>
        {/* Quiet Hours Section */}
        <Card className={`mb-6 border-none shadow-lg ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        }`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
              <Moon className="w-5 h-5" />
              Quiet Hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                  Enable Quiet Hours
                </p>
                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  Silence reminders during set hours (in your timezone)
                </p>
              </div>
              <Switch
                checked={quietHoursEnabled}
                onCheckedChange={handleQuietHoursToggle}
                disabled={quietHoursSaving}
              />
            </div>
            {quietHoursEnabled && (
              <>
                <p className={`text-sm mb-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  No reminders will be sent between these times. For example, 10 PM to 8 AM.
                </p>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <Label htmlFor="quiet-start" className={theme === 'dark' ? 'text-gray-200' : ''}>Start Time</Label>
                    <Input
                      id="quiet-start"
                      type="time"
                      value={quietHoursStart}
                      onChange={(e) => handleQuietHoursChange(e.target.value, quietHoursEnd)}
                      onBlur={handleQuietHoursSave}
                      className={theme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : ''}
                    />
                  </div>
                  <div>
                    <Label htmlFor="quiet-end" className={theme === 'dark' ? 'text-gray-200' : ''}>End Time</Label>
                    <Input
                      id="quiet-end"
                      type="time"
                      value={quietHoursEnd}
                      onChange={(e) => handleQuietHoursChange(quietHoursStart, e.target.value)}
                      onBlur={handleQuietHoursSave}
                      className={theme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : ''}
                    />
                  </div>
                </div>
                {quietHoursSaving && <p className="text-xs text-gray-500">Saving…</p>}
              </>
            )}
          </CardContent>
        </Card>

        {/* Full-screen reminders: the account default, the ring sound and the
            phone permissions. The card renders nothing on a build without the
            AlarmBridge plugin (older installs, the browser), so it is safe for
            everyone. The one-time popups tell people it lives here. */}
        <AlarmCard user={user} theme={theme} />
        </>)}

        {!page && (<>
        <p className={`text-xs font-bold uppercase tracking-wider mt-8 mb-3 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Adding tasks</p>
        <QuickCaptureCard theme={theme} />

        <p className={`text-xs font-bold uppercase tracking-wider mt-8 mb-3 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Account</p>
        {/* Account Settings */}
        <Card className={`mb-6 border-none shadow-lg ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        }`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : ''}`}>
              <SettingsIcon className="w-5 h-5" />
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {settingsItems.map((item, idx) => {
              const Icon = item.icon;
              return (
                <Button
                  key={idx}
                  onClick={item.onClick}
                  variant="outline"
                  className={`w-full flex items-center justify-start gap-3 py-6 px-4 rounded-lg text-base ${
                    theme === 'dark' 
                      ? 'bg-gray-700 border-gray-600 hover:bg-gray-600 text-white' 
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Button>
              );
            })}
          </CardContent>
        </Card>

        {/* Logout */}
        <Card className={`border-none shadow-lg ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        }`}>
          <CardContent className="pt-6">
            <Button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-6 bg-red-600 hover:bg-red-700 text-white rounded-lg text-base"
            >
              <LogOut className="w-5 h-5" />
              Log Out
            </Button>
          </CardContent>
        </Card>

        {/* Developer-only tools — hidden for everyone else. */}
        {user?.email === 's2kap2chick@gmail.com' && (
          <AdDiagnosticsCard user={user} theme={theme} />
        )}

        <VersionTap user={user} theme={theme} />
        </>)}

        <div style={{ height: '80px' }} aria-hidden="true" />
      </div>
    </div>
  );
}