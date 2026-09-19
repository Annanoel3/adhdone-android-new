import React, { useState, useRef } from "react";
import { Brain } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { randomFact } from "./attentionFacts";

const HOLD_MS = 3000;

// The app title in the header. Hold it for three seconds and it quietly hands
// you one fact about attention. Tapping does nothing — it's a hidden thing.
export default function LongPressBrandTitle({ className }) {
  const [fact, setFact] = useState(null);
  const timer = useRef(null);
  const lastFact = useRef(null);

  const start = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = randomFact(lastFact.current);
      lastFact.current = next;
      setFact(next);
    }, HOLD_MS);
  };

  const cancel = () => clearTimeout(timer.current);

  return (
    <>
      <h1
        className={`${className} select-none cursor-default`}
        onTouchStart={start}
        onTouchEnd={cancel}
        onTouchCancel={cancel}
        onTouchMove={cancel}
        onMouseDown={start}
        onMouseUp={cancel}
        onMouseLeave={cancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        ADHDone
      </h1>

      <Dialog open={!!fact} onOpenChange={() => setFact(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-600" />
              One thing about attention
            </DialogTitle>
          </DialogHeader>
          <p className="text-base leading-relaxed text-gray-700">{fact}</p>
          <p className="text-xs text-gray-400">You found a hidden one. Hold the title again for another.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}