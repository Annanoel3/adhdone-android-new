import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { surfaceClasses, mutedText, subtleText, destructiveButton } from '@/components/utils/launchTheme';

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Yes, cancel',
  cancelLabel = 'Keep going',
  onConfirm,
  onClose,
  theme,
  specialMode,
}) {
  const surface = surfaceClasses(theme, specialMode);
  const muted = mutedText(theme, specialMode);
  const subtle = subtleText(theme, specialMode);
  const destructive = destructiveButton();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className={`z-[200] max-w-sm w-[calc(100vw-2rem)] text-center overflow-hidden ${surface}`}>
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          {description && (
            <DialogDescription className={`leading-relaxed ${muted}`}>
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-2">
          <button
            onClick={onConfirm}
            className={`w-full rounded-xl text-sm font-semibold py-2.5 transition-colors ${destructive}`}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onClose}
            className={`w-full text-sm font-medium py-2.5 transition-colors ${subtle} hover:opacity-100`}
          >
            {cancelLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}