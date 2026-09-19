import React from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

// The ADHDone task list right after three texts were shared into it.
export default function AdCapturedTasks({ tasks, visibleCount }) {
  return (
    <div style={{ width: 'min(86vw, 30vh, 420px)' }} className="mx-auto rounded-[26px] p-[6px] bg-[#1b1b1f] shadow-[0_26px_60px_rgba(0,0,0,0.35)]">
      <div className="rounded-[21px] overflow-hidden bg-gradient-to-b from-stone-50 to-white px-3 pt-3 pb-4 flex flex-col aspect-[9/19]">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-5 h-5 rounded-lg bg-gradient-to-br from-orange-400 to-rose-400 flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-white" />
          </span>
          <p className="text-[12px] font-bold text-gray-900">Today's Tasks</p>
        </div>
        <p className="text-[9px] text-gray-500 mb-2.5">Created from 3 shared texts</p>

        <div className="space-y-2">
          {tasks.map((t, i) => (
            visibleCount > i && (
              <motion.div
                key={t.title}
                initial={{ opacity: 0, y: 14, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.32, ease: "easeOut" }}
                className="rounded-2xl bg-white border border-gray-200 px-3 py-2.5 shadow-sm"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 w-3 h-3 rounded-full border-2 border-gray-300 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold text-gray-900 leading-snug">{t.title}</p>
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      <span className="rounded-md bg-orange-100 text-orange-700 text-[7.5px] font-semibold px-1.5 py-0.5">
                        {t.when}
                      </span>
                      <span className="rounded-md bg-purple-100 text-purple-700 text-[7.5px] font-semibold px-1.5 py-0.5">
                        {t.tag}
                      </span>
                      <span className="text-[7.5px] text-gray-400">from {t.from}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          ))}
        </div>
      </div>
    </div>
  );
}