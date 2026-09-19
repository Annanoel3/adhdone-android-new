import React from "react";
import { Play } from "lucide-react";
import { Card } from "@/components/brand/BrandSection";

// Each spot is a live, auto-looping page in the app — open it and screen-record.
export default function AdSpotGrid({ spots }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {spots.map((s) => (
        <Card key={s.path} className="p-5 flex flex-col">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h3 className="font-bold leading-snug">{s.name}</h3>
            <span className="text-[11px] font-mono text-[#7A6F6F] whitespace-nowrap pt-1">{s.length}</span>
          </div>
          <p className="text-xs font-bold tracking-widest uppercase text-[#B4A6A6] mb-1">Hypothesis</p>
          <p className="text-sm text-[#5A5252] mb-3">{s.hypothesis}</p>
          <p className="text-xs font-bold tracking-widest uppercase text-[#B4A6A6] mb-1">What happens</p>
          <p className="text-sm text-[#5A5252] leading-relaxed flex-1">{s.beat}</p>
          <a
            href={s.path}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 self-start px-4 py-2 rounded-xl bg-[#2F2A2A] hover:bg-[#1F1B1B] text-white text-sm font-semibold transition-colors"
          >
            <Play className="w-4 h-4" /> Open &amp; record
          </a>
        </Card>
      ))}
    </div>
  );
}