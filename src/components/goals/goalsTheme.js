import { useEffect, useState } from "react";
import { isSeasonal, outlineButton } from "@/components/utils/launchTheme";
import { winLook } from "@/components/wins/winsTheme";

// Looks for the Goals pages (Goals, Planner, a goal's page) and the Home card,
// for every theme: light/minimalist, dark, colorful, spicybrains, and the
// seasonal skins. On a seasonal skin a card carries `${specialMode}-card`; on
// the night seasons (Halloween, Christmas, New Year's, 4th of July) the app's
// dark glass (HalloweenMode.darkGlassCss) turns those cards, every pale panel
// inside them and every grey text to dark glass with light text, so nothing
// here is ever a white card on a dark season. Dialogs are portaled outside the
// app shell, where that glass doesn't reach: they use dialogLook (the wins
// popups' winLook), which is dark glass on those seasons itself.

export function readGoalTheme() {
  try {
    return {
      theme: localStorage.getItem("adhd_theme") || "minimalist",
      specialMode: localStorage.getItem("special_mode") || "normal",
    };
  } catch (e) {
    return { theme: "minimalist", specialMode: "normal" };
  }
}

// The layout writes the theme into localStorage a moment after the account
// loads, so pages keep reading it (Home does the same).
export function useGoalTheme() {
  const [state, setState] = useState(readGoalTheme);
  useEffect(() => {
    const t = setInterval(() => {
      const next = readGoalTheme();
      setState((prev) => (prev.theme === next.theme && prev.specialMode === next.specialMode ? prev : next));
    }, 1000);
    return () => clearInterval(t);
  }, []);
  return state;
}

export function goalLook(theme, specialMode) {
  const seasonal = isSeasonal(specialMode);
  const dark = theme === "dark" && !seasonal;
  const plain = theme === "minimalist";
  return {
    seasonal,
    dark,
    card: seasonal
      ? `${specialMode}-card border-none shadow-md`
      : dark
        ? "bg-gray-800 border border-gray-700 shadow-md"
        : plain
          ? "bg-white/80 backdrop-blur-sm border border-gray-200 shadow-sm"
          : "bg-gradient-to-br from-violet-50 to-indigo-50 border-2 border-violet-200 shadow-sm",
    panel: dark ? "bg-gray-900/50 border-gray-700" : "bg-gray-50 border-gray-200",
    row: dark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200",
    rowDone: dark ? "bg-emerald-900/20 border-emerald-800" : "bg-green-50 border-green-100",
    title: dark ? "text-white" : "text-gray-900",
    text: dark ? "text-gray-200" : "text-gray-800",
    soft: dark ? "text-gray-300" : "text-gray-600",
    muted: dark ? "text-gray-400" : "text-gray-500",
    track: dark ? "bg-gray-700" : "bg-gray-200",
    fill: "bg-gradient-to-r from-violet-500 to-indigo-500",
    accent: dark ? "text-violet-300" : "text-violet-700",
    chip: dark ? "bg-violet-900/40 text-violet-200" : "bg-violet-100 text-violet-700",
    primary: "bg-violet-600 hover:bg-violet-700 text-white",
    outline: outlineButton(theme, specialMode),
    input: dark
      ? "bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500"
      : "bg-white border-gray-300 text-gray-900 placeholder:text-gray-400",
    tabs: dark ? "bg-gray-800" : "bg-gray-100",
    tabOn: dark ? "bg-gray-700 text-gray-100 shadow-sm" : "bg-white text-gray-900 shadow-sm",
    tabOff: dark ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700",
    bubbleAi: dark ? "bg-gray-800 border border-gray-700 text-gray-100" : "bg-white border border-gray-200 text-gray-800",
    bubbleMe: dark ? "bg-violet-700 text-white" : "bg-gradient-to-br from-violet-600 to-indigo-600 text-white",
    bar: seasonal
      ? `${specialMode}-card border-t`
      : dark
        ? "bg-gray-900/95 border-t border-gray-800"
        : "bg-white/95 border-t border-gray-200",
    tip: dark ? "bg-amber-900/20 border-amber-800 text-amber-100" : "bg-amber-50 border-amber-100 text-amber-900",
    danger: dark ? "text-red-400" : "text-red-600",
  };
}

// Dialogs (outside the app shell).
export function dialogLook(theme, specialMode) {
  const w = winLook(theme, specialMode);
  return {
    ...w,
    tip: w.night
      ? "bg-black/30 border-white/10 text-gray-100"
      : theme === "dark" && !isSeasonal(specialMode)
        ? "bg-amber-900/20 border-amber-800 text-amber-100"
        : "bg-amber-50 border-amber-100 text-amber-900",
    title: w.night || (theme === "dark" && !isSeasonal(specialMode)) ? "text-white" : "text-gray-900",
    text: w.night || (theme === "dark" && !isSeasonal(specialMode)) ? "text-gray-200" : "text-gray-700",
  };
}
