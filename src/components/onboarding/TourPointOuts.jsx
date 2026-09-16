import React from "react";

// Inline point-outs inside a single intro card — the replacement for what used
// to be separate sequential tour steps.
export default function TourPointOuts({ points }) {
  if (!points?.length) return null;
  return (
    <ul className="mt-3 space-y-2.5">
      {points.map((p) => (
        <li key={p.label} className="rounded-xl bg-muted/60 px-3 py-2.5">
          <p className="text-sm font-semibold text-foreground">{p.label}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{p.text}</p>
        </li>
      ))}
    </ul>
  );
}