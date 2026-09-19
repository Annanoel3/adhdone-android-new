import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import AdShareSheet from "./AdShareSheet";

// A texting thread on a phone — the messages arrive one at a time, the last one
// can be shown selected (highlighted) and then shared.
export default function AdMessagesPhone({
  sender,
  clock = "4:08 PM",
  messages = [],
  highlight = false,
  showSheet = false,
  banners = [],
  children,
}) {
  return (
    <div className="w-full rounded-[38px] p-[7px] bg-[#1b1b1f] shadow-[0_26px_60px_rgba(0,0,0,0.35)]">
      <div
        className="relative rounded-[32px] overflow-hidden bg-white flex flex-col"
        style={{ minHeight: 470 }}
      >
        {/* status bar */}
        <div className="flex items-center justify-between px-4 pt-2 pb-1 text-[9px] font-semibold text-gray-500">
          <span>•••○○ Sprint LTE</span>
          <span className="text-gray-900">{clock}</span>
          <span>75% ▰</span>
        </div>

        {children || (
          <>
            {/* thread header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-white">
              <span className="flex items-center text-[11px] font-medium text-blue-500">
                <ChevronLeft className="w-3.5 h-3.5" />
                Messages
              </span>
              <span className="text-[13px] font-semibold text-gray-900">{sender}</span>
              <span className="text-[11px] font-medium text-blue-500">Details</span>
            </div>

            {/* bubbles */}
            <div className="flex-1 px-3 py-3 space-y-2">
              <AnimatePresence>
                {messages.map((m, i) => {
                  const isLast = i === messages.length - 1;
                  const selected = highlight && isLast && m.from === "them";
                  return (
                    <motion.div
                      key={m.text}
                      initial={{ opacity: 0, y: 14, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`relative max-w-[76%] rounded-2xl px-3 py-2 text-[12px] leading-snug ${
                          m.from === "me"
                            ? "bg-green-500 text-white"
                            : selected
                              ? "bg-blue-200 text-gray-900"
                              : "bg-gray-100 text-gray-900"
                        }`}
                      >
                        {m.text}
                        {selected && (
                          <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className="absolute -bottom-7 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-full bg-[#2b2b2e] px-3 py-1.5 text-white text-[10px] shadow-lg whitespace-nowrap z-10"
                          >
                            <span>Copy</span>
                            <span className="font-semibold text-orange-300">Share</span>
                          </motion.div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </>
        )}

        {/* distraction banners across the top */}
        <div className="absolute top-[52px] left-2 right-2 space-y-1 z-30">
          <AnimatePresence>
            {banners.map((b) => (
              <motion.div
                key={b}
                initial={{ opacity: 0, y: -18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="rounded-xl bg-white/95 backdrop-blur px-3 py-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.15)]"
              >
                <p className="text-[10px] font-semibold text-gray-800 leading-tight">{b}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {showSheet && (
            <AdShareSheet snippet={messages[messages.length - 1]?.text || ""} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}