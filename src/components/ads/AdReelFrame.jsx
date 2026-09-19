import React from "react";

// Reel-safe layout. Social platforms paint their own text over the top and
// bottom of a vertical video (username, caption, sound, buttons), so this frame
// reserves those strips and keeps every piece of our own content in the middle
// band. Row heights are fixed, so nothing shifts when copy appears or leaves.
export default function AdReelFrame({ headline, phone, caption }) {
  return (
    <div className="h-screen w-full overflow-hidden bg-[#FDF6EC] relative flex flex-col items-center px-5">
      <div className="pointer-events-none absolute -top-28 -left-20 w-80 h-80 rounded-full bg-orange-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-20 w-80 h-80 rounded-full bg-rose-200/40 blur-3xl" />

      {/* platform strip — kept clear on purpose */}
      <div className="h-[7vh] shrink-0" />

      {/* headline band */}
      <div className="h-[13vh] shrink-0 w-full max-w-sm flex items-center justify-center text-center relative z-10">
        {headline}
      </div>

      {/* phone band — fixed height, so the device never resizes or jumps */}
      <div className="flex-1 min-h-0 w-full flex items-center justify-center relative z-10 py-1">
        {phone}
      </div>

      {/* caption band */}
      <div className="h-[16vh] shrink-0 w-full max-w-sm flex items-start justify-center pt-2 text-center relative z-10">
        {caption}
      </div>

      {/* platform strip — username / caption / sound live here */}
      <div className="h-[13vh] shrink-0" />
    </div>
  );
}