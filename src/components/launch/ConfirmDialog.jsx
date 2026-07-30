import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Yes, cancel',
  cancelLabel = 'Keep going',
  onConfirm,
  onClose,
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="max-w-sm w-[calc(100vw-2rem)] text-center overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-900">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-gray-600 leading-relaxed">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-2">
          <button
            onClick={onConfirm}
            className="w-full rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold py-2.5 transition-colors"
          >
            {confirmLabel}
          </button>
          <button
            onClick={onClose}
            className="w-full text-sm font-medium text-gray-500 hover:text-gray-900 py-2.5 transition-colors"
          >
            {cancelLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}