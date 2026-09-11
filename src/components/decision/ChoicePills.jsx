import React from "react";
import { Badge } from "@/components/ui/badge";

export default function ChoicePills({ choices, winner }) {
  if (!choices.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        Found {choices.length} {choices.length === 1 ? "option" : "options"}
      </p>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice, i) => (
          <Badge
            key={`${choice}-${i}`}
            variant={winner && winner.toLowerCase() === choice.toLowerCase() ? "default" : "secondary"}
            className="text-sm px-3 py-1"
          >
            {choice}
          </Badge>
        ))}
      </div>
    </div>
  );
}