import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { openInBrowser } from "@/components/utils/openInBrowser";

// A Support Space reply, formatted. The AI writes in Markdown (**bold**,
// lists, [site](link), a "Sources" list with bare links), and until Nov 6 2026
// it was shown as plain text: asterisks and brackets everywhere, and the
// links at the bottom couldn't be tapped (Anna, on the iPhone: "a bunch of
// asterisks and weird things. and the link at the bottom is not clickable").
// Links open in the phone's own browser (openInBrowser), never inside the app.
// No raw HTML is ever rendered (react-markdown's default).

// Bare links become Markdown links. Kept out of: a link's own target "](…)"
// and link text that is itself a URL "[https://…](…)". Trailing punctuation
// stays outside the link. (No lookbehind: older iPhones can't parse it.)
export function linkifyBareUrls(text) {
  return String(text || "").replace(/https?:\/\/[^\s<>()[\]]+/g, (url, offset, all) => {
    const before = all.slice(Math.max(0, offset - 2), offset);
    if (before === "](" || all[offset - 1] === "[" || all[offset - 1] === "<") return url;
    let clean = url;
    let tail = "";
    while (/[.,;:!?'"*_]$/.test(clean)) {
      tail = clean.slice(-1) + tail;
      clean = clean.slice(0, -1);
    }
    return clean ? `[${clean}](${clean})${tail}` : url;
  });
}

export default function SupportReply({ text, theme }) {
  const dark = theme === "dark";
  const linkClass = dark ? "text-purple-300" : "text-purple-700";
  const md = useMemo(() => linkifyBareUrls(text), [text]);
  const components = useMemo(() => ({
    a: ({ href, children }) => (
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault();
          if (href && /^https?:\/\//i.test(href)) openInBrowser(href);
        }}
        className={`underline break-words [overflow-wrap:anywhere] ${linkClass}`}
      >
        {children}
      </a>
    ),
    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-1">{children}</ol>,
    li: ({ children }) => <li>{children}</li>,
    h1: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
    h2: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
    h3: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
    h4: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em>{children}</em>,
    code: ({ children }) => <code className={`px-1 rounded ${dark ? "bg-white/10" : "bg-black/5"}`}>{children}</code>,
    pre: ({ children }) => <div className="whitespace-pre-wrap mb-2">{children}</div>,
    hr: () => <hr className="my-2 opacity-30" />,
    blockquote: ({ children }) => <div className="pl-3 border-l-2 border-current/30 mb-2">{children}</div>,
    img: () => null,
  }), [dark, linkClass]);

  return (
    <div className={`leading-relaxed break-words ${dark ? "text-gray-200" : "text-gray-800"}`}>
      <ReactMarkdown components={components}>{md}</ReactMarkdown>
    </div>
  );
}
