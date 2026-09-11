import React, { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Share2, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { shareEntryImage } from "./shareEntryImage";

export default function DiaryEntryCard({ entry }) {
  const shotRef = useRef(null);
  const [sharing, setSharing] = useState(false);

  const dateLabel = format(parseISO(entry.entry_date), "EEEE, MMMM d, yyyy");

  const share = async () => {
    setSharing(true);
    try {
      await shareEntryImage(shotRef.current, `diary-${entry.entry_date}`);
    } finally {
      setSharing(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div ref={shotRef} className="bg-white p-4 rounded-xl space-y-2">
          <p className="text-sm font-semibold text-gray-900">{dateLabel}</p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
            {entry.content || "(empty)"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={share} disabled={sharing}>
          {sharing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Share2 className="w-4 h-4 mr-2" />
          )}
          Save as image
        </Button>
      </CardContent>
    </Card>
  );
}