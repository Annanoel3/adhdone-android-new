import React, { useState } from 'react';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, ZoomIn, ZoomOut } from "lucide-react";

export default function ImageViewer({ imageUrl, isOpen, onClose }) {
  const [zoom, setZoom] = useState(1);

  const handleClose = () => {
    setZoom(1);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-full w-screen h-screen p-0 bg-black/95 border-none">
        <div className="relative w-full h-full flex items-center justify-center">
          <Button
            onClick={handleClose}
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 z-50 bg-white/10 hover:bg-white/20 text-white"
          >
            <X className="w-6 h-6" />
          </Button>

          <div 
            className="absolute left-1/2 -translate-x-1/2 flex gap-2 z-50"
            style={{ bottom: 'max(1rem, calc(1rem + env(safe-area-inset-bottom)))' }}
          >
            <Button
              onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
              variant="ghost"
              size="icon"
              className="bg-white/10 hover:bg-white/20 text-white"
            >
              <ZoomOut className="w-5 h-5" />
            </Button>
            <Button
              onClick={() => setZoom(1)}
              variant="ghost"
              className="bg-white/10 hover:bg-white/20 text-white px-4"
            >
              {Math.round(zoom * 100)}%
            </Button>
            <Button
              onClick={() => setZoom(Math.min(3, zoom + 0.25))}
              variant="ghost"
              size="icon"
              className="bg-white/10 hover:bg-white/20 text-white"
            >
              <ZoomIn className="w-5 h-5" />
            </Button>
          </div>

          <img
            src={imageUrl}
            alt="Full size view"
            className="max-w-full max-h-full object-contain transition-transform duration-200"
            style={{ transform: `scale(${zoom})` }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}