import React from 'react';
import { Smartphone } from 'lucide-react';

/**
 * Small reminder shown during actions that stop working if the app is closed
 * (calendar sync, 5-minute sprints, the launchpad countdown).
 */
export default function KeepAppOpenNote({ text = 'Keep ADHDone open — closing the app stops this.', className = '' }) {
  return (
    <p className={`flex items-center justify-center gap-1.5 text-xs text-amber-600 ${className}`}>
      <Smartphone className="w-3.5 h-3.5 flex-shrink-0" />
      <span>{text}</span>
    </p>
  );
}