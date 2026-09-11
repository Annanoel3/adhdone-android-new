import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Image as ImageIcon, Smile, Loader2 } from "lucide-react";
import StickerPicker from "./StickerPicker";

export default function DiaryAddMenu({ onAddImage, onAddSticker }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadPrivateFile({ file });
      if (res?.file_uri) await onAddImage(res.file_uri);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={pickFile}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Plus className="w-4 h-4 mr-2" />
        )}
        Add
        <ImageIcon className="w-4 h-4 ml-2 opacity-60" />
      </Button>

      <Popover open={stickersOpen} onOpenChange={setStickersOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Smile className="w-4 h-4 mr-2" />
            Stickers
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="start">
          <StickerPicker
            onPick={(char) => {
              onAddSticker(char);
              setStickersOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}