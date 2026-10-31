import { surfaceClasses, mutedText, subtleText, outlineButton, isSeasonal } from "@/components/utils/launchTheme";

// Looks for the wins popups. Dialogs render outside the app shell, so the
// night seasons' dark-glass styles (HalloweenMode.darkGlassCss) don't reach
// them: on those seasons the popup is dark glass here too, darker than what's
// behind it, light text, nothing white (Anna, Oct 1/3/27 2026). Every other
// look comes from the same helpers the Sprint and confirm popups use.
const NIGHT_GLASS = {
  halloween: "bg-[#0e091a]/90",
  christmas: "bg-[#08160e]/90",
  newyears: "bg-[#0a0a16]/90",
  fourthjuly: "bg-[#080c1e]/90",
};

export function readSpecialMode() {
  try { return localStorage.getItem("special_mode") || "normal"; } catch { return "normal"; }
}

export function winLook(theme, specialMode = readSpecialMode()) {
  const glass = NIGHT_GLASS[specialMode];
  if (glass) {
    return {
      surface: `${glass} backdrop-blur-xl text-gray-100 border-white/15`,
      muted: "text-gray-300",
      subtle: "text-gray-400",
      field: "bg-black/30 border-white/20 text-white placeholder:text-white/50",
      row: "bg-black/30 border-white/10",
      outline: "border border-white/20 bg-white/10 hover:bg-white/20 text-gray-100",
      // The shared mic button is an outline button (white on these seasons).
      mic: "[&_button.bg-background]:!bg-white/10 [&_button.bg-background]:!border-white/20 [&_button.bg-background]:!text-white",
      night: true,
    };
  }
  const dark = theme === "dark" && !isSeasonal(specialMode);
  return {
    surface: surfaceClasses(theme, specialMode),
    muted: mutedText(theme, specialMode),
    subtle: subtleText(theme, specialMode),
    field: dark
      ? "bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500"
      : "bg-white border-gray-300 text-gray-900 placeholder:text-gray-400",
    row: dark ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200",
    outline: outlineButton(theme, specialMode),
    mic: "",
    night: false,
  };
}
