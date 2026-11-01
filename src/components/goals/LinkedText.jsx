import React from "react";
import { openInBrowser } from "@/components/utils/openInBrowser";

// Text the planner wrote, with its links: a markdown link shows its name, a
// bare link shows its site, and either opens in the phone's browser
// (openInBrowser), never over the app. Long links wrap instead of widening the
// screen (Anna, Nov 1 2026: a step's popup was too wide and scrolled sideways,
// pushed out by "([nimh.nih.gov](https://www.nimh.nih.gov/...?utm_source=openai))").

const LINK_SPLIT = /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)\]]+)/g;

// Tracking tags the web search adds (?utm_source=openai) aren't part of the link.
export function cleanHref(url) {
  try {
    const u = new URL(url);
    [...u.searchParams.keys()].filter((k) => /^utm_/i.test(k)).forEach((k) => u.searchParams.delete(k));
    return u.toString();
  } catch (e) {
    return url;
  }
}

const siteOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return url;
  }
};

// The same text with links as words only (for one-line previews).
export function linkFreeText(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/g, "$1")
    .replace(/https?:\/\/[^\s)\]]+/g, (m) => siteOf(m));
}

export default function LinkedText({ text, className = "", linkClassName = "underline font-semibold" }) {
  const parts = String(text || "").split(LINK_SPLIT);
  return (
    <span className={`break-words [overflow-wrap:anywhere] ${className}`}>
      {parts.map((part, i) => {
        if (!part) return null;
        const md = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
        const href = md ? md[2] : /^https?:\/\//.test(part) ? part.replace(/[.,;:!?]+$/, "") : null;
        if (!href) return <React.Fragment key={i}>{part}</React.Fragment>;
        const clean = cleanHref(href);
        const label = md ? md[1] : siteOf(href);
        const trail = md ? "" : part.slice(href.length);
        return (
          <React.Fragment key={i}>
            <a
              href={clean}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); openInBrowser(clean); }}
              className={linkClassName}
            >
              {label}
            </a>
            {trail}
          </React.Fragment>
        );
      })}
    </span>
  );
}
