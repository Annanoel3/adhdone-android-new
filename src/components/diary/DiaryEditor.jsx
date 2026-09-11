import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { format } from "date-fns";
import DiaryAddMenu from "./DiaryAddMenu";
import DiaryMediaStrip from "./DiaryMediaStrip";

export default function DiaryEditor({ entry, onSave }) {
  const [content, setContent] = useState(entry?.content || "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    setContent(entry?.content || "");
    setSavedAt(null);
  }, [entry?.id]);

  const images = entry?.images || [];
  const stickers = entry?.stickers || [];

  const save = async () => {
    setSaving(true);
    await onSave({ content });
    setSaving(false);
    setSavedAt(new Date());
  };

  const dirty = content !== (entry?.content || "");

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <p className="text-sm font-medium text-gray-900">
          {format(new Date(), "EEEE, MMMM d")}
        </p>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write whatever's in your head..."
          rows={12}
          className="text-base leading-relaxed"
        />

        <DiaryAddMenu
          onAddImage={(uri) => onSave({ content, images: [...images, uri] })}
          onAddSticker={(char) => onSave({ content, stickers: [...stickers, char] })}
        />

        <DiaryMediaStrip
          images={images}
          stickers={stickers}
          onRemoveImage={(uri) => onSave({ content, images: images.filter((u) => u !== uri) })}
          onRemoveSticker={(i) => onSave({ content, stickers: stickers.filter((_, idx) => idx !== i) })}
        />

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving || !dirty}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving
              </>
            ) : (
              "Save entry"
            )}
          </Button>
          {!dirty && savedAt && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="w-3.5 h-3.5" />
              Saved
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}