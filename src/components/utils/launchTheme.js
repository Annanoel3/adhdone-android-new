// Theme helpers for the Launchpad / Sprint / Confirm overlays so they match the
// user's chosen visual theme (minimalist/light, dark, colorful, spicybrains)
// and the seasonal/holiday modes. The Layout persists `adhd_theme` and
// `special_mode` to localStorage; theme changes reload the app, so a
// render-time read is sufficient.

const SEASONAL = [
  'christmas', 'valentines', 'newyears', 'stpatricks', 'fourthjuly',
  'summer', 'spring', 'kawaii', 'halloween', 'fall', 'winter',
];

export function readThemeState() {
  if (typeof window === 'undefined') return { theme: 'minimalist', specialMode: 'normal' };
  return {
    theme: localStorage.getItem('adhd_theme') || 'minimalist',
    specialMode: localStorage.getItem('special_mode') || 'normal',
  };
}

export function isSeasonal(specialMode) {
  return SEASONAL.includes(specialMode);
}

// Full-screen immersive overlay (Launchpad countdown).
export function overlayClasses(theme, specialMode) {
  if (isSeasonal(specialMode)) {
    // Translucent dark veil so the seasonal wallpaper stays visible behind the
    // countdown, with light text on top.
    return {
      bg: 'bg-black/55 backdrop-blur-md',
      text: 'text-white',
      muted: 'text-white/75',
      title: 'text-orange-300',
      accent: 'bg-white/15 text-white',
      ringTrack: 'rgba(255,255,255,0.2)',
      ring: '#a78bfa',
      ringWarn: '#fbbf24',
      warnText: 'text-amber-300',
    };
  }
  switch (theme) {
    case 'dark':
      return {
        bg: 'bg-gradient-to-br from-indigo-950 via-purple-900 to-slate-900',
        text: 'text-white',
        muted: 'text-indigo-100/80',
        title: 'text-orange-300',
        accent: 'bg-gradient-to-br from-orange-400 to-pink-500 text-white',
        ringTrack: 'rgba(255,255,255,0.12)',
        ring: '#a78bfa',
        ringWarn: '#fbbf24',
        warnText: 'text-amber-300',
      };
    case 'spicybrains':
      return {
        bg: 'bg-gradient-to-br from-pink-200 via-purple-200 to-cyan-200',
        text: 'text-gray-900',
        muted: 'text-gray-700',
        title: 'text-pink-600',
        accent: 'bg-gradient-to-br from-pink-500 to-yellow-400 text-gray-900 border-2 border-cyan-400',
        ringTrack: 'rgba(0,0,0,0.1)',
        ring: '#d946ef',
        ringWarn: '#f97316',
        warnText: 'text-orange-600',
      };
    case 'colorful':
      return {
        bg: 'bg-gradient-to-br from-purple-100 via-orange-100 to-teal-100',
        text: 'text-gray-900',
        muted: 'text-gray-700',
        title: 'text-orange-600',
        accent: 'bg-gradient-to-br from-purple-400 to-pink-500 text-white',
        ringTrack: 'rgba(0,0,0,0.08)',
        ring: '#7c3aed',
        ringWarn: '#f59e0b',
        warnText: 'text-amber-600',
      };
    default: // minimalist / light
      return {
        bg: 'bg-gradient-to-br from-sky-100 via-indigo-100 to-purple-100',
        text: 'text-gray-900',
        muted: 'text-gray-600',
        title: 'text-orange-600',
        accent: 'bg-gradient-to-br from-orange-400 to-pink-500 text-white',
        ringTrack: 'rgba(0,0,0,0.08)',
        ring: '#7c3aed',
        ringWarn: '#f59e0b',
        warnText: 'text-amber-600',
      };
  }
}

// Dialog content surface (Sprint popup, Confirm dialog).
export function surfaceClasses(theme, specialMode) {
  if (isSeasonal(specialMode)) {
    return 'bg-white/80 backdrop-blur-md text-gray-900 border-white/40';
  }
  switch (theme) {
    case 'dark':
      return 'bg-gray-900 text-gray-100 border-gray-700';
    case 'spicybrains':
      return 'bg-gradient-to-br from-pink-100 via-purple-100 to-cyan-100 text-gray-900 border-2 border-yellow-400';
    case 'colorful':
      return 'bg-white text-gray-900 border-purple-200';
    default:
      return 'bg-white text-gray-900 border-gray-200';
  }
}

export function mutedText(theme, specialMode) {
  if (isSeasonal(specialMode)) return 'text-gray-700';
  if (theme === 'dark') return 'text-gray-300';
  if (theme === 'spicybrains') return 'text-gray-800';
  return 'text-gray-600';
}

export function subtleText(theme, specialMode) {
  if (isSeasonal(specialMode)) return 'text-gray-500';
  if (theme === 'dark') return 'text-gray-400';
  if (theme === 'spicybrains') return 'text-gray-700';
  return 'text-gray-500';
}

// Primary action — emerald (the Sprint brand color).
export function primaryButton(theme, specialMode) {
  if (theme === 'dark' && !isSeasonal(specialMode)) return 'bg-emerald-500 hover:bg-emerald-600 text-white';
  return 'bg-emerald-600 hover:bg-emerald-700 text-white';
}

// Secondary / outline action that sits inside the dialog surface.
export function outlineButton(theme, specialMode) {
  if (isSeasonal(specialMode)) return 'border border-gray-300 bg-white/60 hover:bg-white/80 text-gray-900';
  if (theme === 'dark') return 'border border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-100';
  if (theme === 'spicybrains') return 'border-2 border-cyan-400 bg-white/60 hover:bg-white/80 text-gray-900';
  if (theme === 'colorful') return 'border border-purple-200 bg-white hover:bg-purple-50 text-gray-900';
  return 'border border-gray-300 bg-white hover:bg-gray-50 text-gray-900';
}

// Destructive (cancel) action — rose works across all themes.
export function destructiveButton() {
  return 'bg-rose-600 hover:bg-rose-700 text-white';
}

// Floating minimized chip.
export function chipClasses(theme, specialMode) {
  if (isSeasonal(specialMode)) return 'bg-white/80 backdrop-blur-md text-gray-900 border border-white/40';
  if (theme === 'dark') return 'bg-gray-800 text-white border border-gray-700';
  if (theme === 'spicybrains') return 'bg-gradient-to-r from-pink-300 to-yellow-300 text-gray-900 border-2 border-cyan-400';
  if (theme === 'colorful') return 'bg-white text-gray-900 border border-purple-200';
  return 'bg-gray-900 text-white';
}