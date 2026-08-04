import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trash2 } from "lucide-react";

export default function NoteCard({ note, theme, onUpdate, onDelete }) {
  const [title, setTitle] = useState(note.title || "");
  const [content, setContent] = useState(note.content || "");

  // Sync local state when note ID changes (e.g. new note created)
  useEffect(() => {
    setTitle(note.title || "");
    setContent(note.content || "");
  }, [note.id]);

  return (
    <div className={`rounded-lg border p-4 ${
      theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-200'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => onUpdate(note.id, "title", title)}
          placeholder="Note title (optional)"
          className={`border-none px-0 text-base font-semibold focus-visible:ring-0 bg-transparent ${
            theme === 'dark' ? 'text-gray-100' : ''
          }`}
        />
        <Button
          size="icon"
          variant="ghost"
          className="flex-shrink-0 h-8 w-8"
          onClick={() => onDelete(note.id)}
        >
          <Trash2 className="w-4 h-4 text-red-500" />
        </Button>
      </div>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={() => onUpdate(note.id, "content", content)}
        placeholder="Elaborate on your idea..."
        className={`min-h-[150px] resize-y ${
          theme === 'dark' ? 'bg-gray-900/50 text-gray-100 border-gray-700' : ''
        }`}
      />
    </div>
  );
}