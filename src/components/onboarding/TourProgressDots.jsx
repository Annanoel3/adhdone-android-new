import React from "react";

// Where you are in a tour, at a glance. Single-step tours show nothing.
export default function TourProgressDots({ stepNumber, totalSteps }) {
  if (!totalSteps || totalSteps < 2) return null;

  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <span
          key={i}
          className={`rounded-full transition-all duration-200 ${
            i === stepNumber - 1
              ? "w-5 h-1.5 bg-primary"
              : i < stepNumber - 1
                ? "w-1.5 h-1.5 bg-primary/50"
                : "w-1.5 h-1.5 bg-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}