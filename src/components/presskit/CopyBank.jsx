import React from "react";
import { Card } from "@/components/brand/BrandSection";

// Ready-to-paste hooks, captions and tags. Nothing here needs rewriting.
export default function CopyBank({ hooks, captions, hashtags }) {
  return (
    <>
      <h3 className="text-xl font-bold mb-4">Hooks — first line, first second</h3>
      <div className="space-y-2 mb-10">
        {hooks.map((h, i) => (
          <Card key={h} className="px-5 py-3.5 flex gap-4 items-baseline">
            <span className="text-[11px] font-mono text-[#B4A6A6]">{String(i + 1).padStart(2, "0")}</span>
            <p className="text-base font-semibold text-[#2F2A2A] leading-snug">{h}</p>
          </Card>
        ))}
      </div>

      <h3 className="text-xl font-bold mb-4">Captions</h3>
      <div className="grid sm:grid-cols-2 gap-4 mb-10">
        {captions.map((c) => (
          <Card key={c.format} className="p-5">
            <p className="text-xs font-bold tracking-widest uppercase text-[#E07A8B] mb-2">{c.format}</p>
            <p className="text-sm text-[#4A4242] leading-relaxed">{c.text}</p>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <p className="text-xs font-bold tracking-widest uppercase text-[#E07A8B] mb-3">Hashtags</p>
        <div className="flex flex-wrap gap-2">
          {hashtags.map((t) => (
            <span key={t} className="px-3 py-1.5 rounded-full bg-[#FFF6EF] border border-[#F9D8CC] text-sm font-medium text-[#4A4242]">{t}</span>
          ))}
        </div>
      </Card>
    </>
  );
}