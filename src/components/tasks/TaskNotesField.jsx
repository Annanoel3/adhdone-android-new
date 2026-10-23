import React, { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Pencil } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

// A web link in the notes (a video-session or meeting link a capture put there;
// Anna, Oct 19 2026: "This link should have ended up in notes") opens when
// tapped. On the phone the app's screen keeps every web page inside itself
// (MainActivity), so it goes through NotifyBridge.openUrl (build 43 on) to the
// phone's browser or the app that owns the link; on an older build a tap
// copies the link instead. A tap anywhere else in the notes still opens them
// to edit.
const LINK_RE = /((?:https?:\/\/|www\.)[^\s<>"']+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\/[^\s<>"']*)/gi;

const fullUrl = (link) => (/^https?:\/\//i.test(link) ? link : `https://${link}`);

function copyLink(url) {
  if (!navigator.clipboard?.writeText) {
    toast({ title: "Couldn't open the link", description: url });
    return;
  }
  navigator.clipboard.writeText(url)
    .then(() => toast({ title: "Link copied", description: "Paste it in your browser to open it." }))
    .catch(() => toast({ title: "Couldn't open the link", description: url }));
}

function openLink(link) {
  const url = fullUrl(link);
  const bridge = window.Capacitor?.Plugins?.NotifyBridge;
  if (bridge?.openUrl) {
    Promise.resolve(bridge.openUrl({ url })).catch(() => copyLink(url));
    return;
  }
  if (window.Capacitor?.isNativePlatform?.()) {
    copyLink(url);
    return;
  }
  window.open(url, "_blank", "noopener");
}

function withLinks(text, dark) {
  const parts = String(text || "").split(LINK_RE);
  return parts.map((part, i) => {
    if (i % 2 === 0) return part;
    const trail = (part.match(/[.,;:!?)\]]+$/) || [""])[0];
    const link = trail ? part.slice(0, -trail.length) : part;
    return (
      <React.Fragment key={i}>
        <a
          href={fullUrl(link)}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); openLink(link); }}
          className={`underline break-all ${dark ? "text-purple-300" : "text-purple-700"}`}
        >
          {link}
        </a>
        {trail}
      </React.Fragment>
    );
  });
}

// Saved notes show as plain text under the label; tapping them (or the pencil)
// opens the box again. Tapping out saves and folds it back to text.
export default function TaskNotesField({ value, onChange, onSave, theme, startEditing }) {
  const [editing, setEditing] = useState(!!startEditing);
  const dark = theme === "dark";

  const finish = () => {
    onSave();
    if ((value || "").trim()) setEditing(false);
  };

  return (
    <div className="space-y-2">
      <div className={`text-sm font-medium flex items-center gap-2 ${dark ? "text-gray-300" : "text-gray-700"}`}>
        <FileText className="w-4 h-4" />
        <span className="flex-1">Notes</span>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="p-1" aria-label="Edit notes">
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </div>
      {editing ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={finish}
          autoFocus={!!(value || "").trim()}
          placeholder="Add any additional notes..."
          className="min-h-[80px]"
        />
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setEditing(true)}
          onKeyDown={(e) => { if (e.key === "Enter") setEditing(true); }}
          className={`w-full text-left whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm cursor-text ${dark ? "bg-gray-800 text-gray-100" : "bg-gray-50 text-gray-800"}`}
        >
          {withLinks(value, dark)}
        </div>
      )}
    </div>
  );
}