import React from "react";
import { motion } from "framer-motion";
import { AlignLeft, Copy } from "lucide-react";

const APPS = [
  { label: "Quick\nShare", ring: "bg-[#2f6bff]", char: "⇄", white: true },
  { label: "ADHDone", app: true },
  { label: "Gmail", ring: "bg-white", char: "M", gmail: true },
  { label: "Messenger", sub: "Chats", ring: "bg-[#0084ff]", char: "⚡", white: true },
  { label: "Link to", sub: "Send to", ring: "bg-[#dfe6f2]", char: "🖥" },
];

// The real Android "Sharing text" sheet: dark card, snippet row with a
// document chip + copy affordance, then the app row with ADHDone pressed.
export default function AdShareSheet({ snippet }) {
  return (
    <motion.div
      initial={{ y: 160, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
      className="absolute left-1.5 right-1.5 bottom-1.5 rounded-2xl bg-[#1f1f22] overflow-hidden z-20"
    >
      <p className="text-white text-[11px] font-semibold px-3 pt-2.5 pb-2.5">Sharing text</p>
      <div className="border-t border-white/10 px-2.5 py-2.5">
        <div className="flex items-center gap-2 rounded-xl bg-white/[0.07] px-2.5 py-2">
          <span className="w-6 h-6 rounded-lg bg-white flex items-center justify-center shrink-0">
            <AlignLeft className="w-3 h-3 text-gray-700" />
          </span>
          <p className="text-white/80 text-[9px] leading-snug line-clamp-2 flex-1">{snippet}</p>
          <Copy className="w-3 h-3 text-white/60 shrink-0" />
        </div>
      </div>

      <div className="border-t border-white/10 flex items-start gap-0 px-2 pt-3 pb-3 overflow-hidden">
        {APPS.map((a) => (
          <div
            key={a.label}
            className={`relative flex flex-col items-center gap-1.5 w-[19%] shrink-0 py-1 ${
              a.app ? "bg-white/[0.14] rounded-lg" : ""
            }`}
          >
            {a.app ? (
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-200 via-amber-100 to-rose-200 flex items-center justify-center text-[6px] font-extrabold text-gray-800 tracking-tight">
                ADHD
              </span>
            ) : (
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] ${a.ring} ${
                  a.white ? "text-white" : a.gmail ? "text-red-500 font-extrabold" : "text-gray-700"
                }`}
              >
                {a.char}
              </span>
            )}
            <span className="text-white text-[6.5px] text-center leading-tight whitespace-pre-line">
              {a.label}
            </span>
            {a.sub && <span className="text-white/50 text-[7px] leading-none">{a.sub}</span>}
            {a.app && (
              <motion.span
                initial={{ scale: 0.4, opacity: 0.7 }}
                animate={{ scale: 1.9, opacity: 0 }}
                transition={{ duration: 0.7, delay: 0.35, ease: "easeOut" }}
                className="absolute top-1 w-7 h-7 rounded-lg bg-white/50"
              />
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}