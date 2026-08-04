import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Loader2, StickyNote } from "lucide-react";
import NoteCard from "./NoteCard";

export default function IdeaNotesDialog({ idea, isOpen, onClose, theme }) {
  const queryClient = useQueryClient();

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["parkingLotNotes", idea?.id],
    queryFn: () =>
      base44.entities.ParkingLotNote.filter({ idea_id: idea.id }, "-created_date"),
    enabled: !!idea?.id && isOpen,
    initialData: [],
  });

  const createNoteMutation = useMutation({
    mutationFn: () =>
      base44.entities.ParkingLotNote.create({
        idea_id: idea.id,
        title: "",
        content: "",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parkingLotNotes"] });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ParkingLotNote.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parkingLotNotes"] });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (id) => base44.entities.ParkingLotNote.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parkingLotNotes"] });
    },
  });

  if (!idea) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl w-[calc(100vw-1rem)] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StickyNote className="w-5 h-5 text-amber-500" />
            Notes
          </DialogTitle>
          <DialogDescription className="truncate">
            {idea.idea}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-between items-center mb-3">
          <span className="text-sm text-gray-500">
            {notes.length} note{notes.length !== 1 ? "s" : ""}
          </span>
          <Button
            onClick={() => createNoteMutation.mutate()}
            disabled={createNoteMutation.isLoading}
            size="sm"
          >
            {createNoteMutation.isLoading ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-1" />
            )}
            Add Note
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-12">
              <StickyNote className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 mb-4">
                No notes yet. Add one to start elaborating!
              </p>
              <Button onClick={() => createNoteMutation.mutate()}>
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Note
              </Button>
            </div>
          ) : (
            notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                theme={theme}
                onUpdate={(id, field, value) =>
                  updateNoteMutation.mutate({ id, data: { [field]: value } })
                }
                onDelete={(id) => deleteNoteMutation.mutate(id)}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}