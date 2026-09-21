import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { pushWidgetTasks, pushAlarms, pushAlarmSound, setAlarmMode } from '../utils/widgetBridge';

// Seeds the home-screen widget once on app open, from anywhere in the app — a
// notification tap or a share can land the user on a screen that never renders
// today's list, and the widget shouldn't sit stale until they visit Home.
// Once Home does render, TodaysTasks keeps it current as tasks change.
//
// Seeds the phone's alarms the same way, once the signed-in user is known
// (their default alert style, alarm_mode, lives on the profile), and hands
// native the ring sound they chose. Only runs on an app build that has the
// AlarmBridge plugin.
export default function WidgetTaskSync({ user }) {
  useEffect(() => {
    if (!window.Capacitor?.Plugins?.WidgetBridge) return;
    base44.entities.Task.list('-updated_date', 500)
      .then(pushWidgetTasks)
      .catch(() => {});
  }, []);

  const userId = user?.id;
  const alarmMode = user?.alarm_mode;
  useEffect(() => {
    if (!userId || !window.Capacitor?.Plugins?.AlarmBridge) return;
    setAlarmMode(alarmMode);
    base44.entities.Task.list('-updated_date', 500)
      .then(pushAlarms)
      .catch(() => {});
  }, [userId, alarmMode]);

  const soundUrl = user?.alarm_sound_url;
  useEffect(() => {
    if (!userId || !window.Capacitor?.Plugins?.AlarmBridge) return;
    pushAlarmSound(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, soundUrl]);

  return null;
}
