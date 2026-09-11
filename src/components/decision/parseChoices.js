// Turns free-form typed or spoken input into a list of distinct choices.
// Handles "a, b, c", "a, b or c", "a vs b", slashes, newlines, and bullets,
// and strips the lead-in phrasing people naturally speak ("help me pick between ...").
const LEAD_INS = [
  /^(can you |could you |please )?(help me |just )?(pick|choose|decide|select)( for me)?( between| from| among)?[:,\s]+/i,
  /^(what|which) (should i|do i|would i)[^:,]*[:,\s]+/i,
  /^(i can't decide|i cant decide|i'm deciding|im deciding|deciding)( between| on| about)?[:,\s]+/i,
  /^(my )?(options|choices) (are|include)[:,\s]+/i,
  /^(should i (have|get|do|eat|watch|go to))[\s]+/i,
];

export function parseChoices(rawInput) {
  if (!rawInput) return [];

  let text = String(rawInput).trim();

  // Remove a trailing question mark / period so it doesn't stick to the last choice
  text = text.replace(/[?.!]+$/, "").trim();

  // Strip conversational lead-in phrasing (may be layered, e.g. "help me pick: should I get ...")
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of LEAD_INS) {
      const stripped = text.replace(pattern, "").trim();
      if (stripped !== text && stripped.length > 0) {
        text = stripped;
        changed = true;
      }
    }
  }

  const parts = text
    // normalize every supported separator to a single delimiter
    .replace(/\r/g, "\n")
    .replace(/\n+/g, "|")
    .replace(/\s*[;,/]\s*/g, "|")
    .replace(/\s+(or|versus|vs\.?)\s+/gi, "|")
    .replace(/\s+and\s+/gi, "|")
    .split("|")
    .map((part) =>
      part
        // drop bullet/number prefixes from pasted lists
        .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
        .trim()
    )
    .filter((part) => part.length > 0);

  // de-dupe case-insensitively, keeping the first spelling
  const seen = new Set();
  const choices = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      choices.push(part);
    }
  }
  return choices;
}

export function pickRandom(choices) {
  if (!choices.length) return null;
  return choices[Math.floor(Math.random() * choices.length)];
}