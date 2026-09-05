import React, { useState, useEffect } from 'react';
import { MapPin } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Where this task/event actually happens. Editable pill — the AI never guesses
// a location, so this is the only way a user can add one after capture (and the
// errand-combining nudges only fire on tasks that have one).
export default function LocationField({ task, theme, onSave }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(task.location || '');

  useEffect(() => { setValue(task.location || ''); }, [task.id, task.location]);

  const save = (v) => {
    onSave(v.trim() ? v.trim() : null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {task.location ? (
          <button className={`cursor-pointer hover:opacity-80 transition-opacity px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 max-w-full ${
            theme === 'dark' ? 'bg-teal-900 text-teal-300' : 'bg-teal-100 text-teal-700'
          }`}>
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{task.location}</span>
          </button>
        ) : (
          <button className="cursor-pointer hover:opacity-80 transition-opacity border border-dashed border-gray-300 px-3 py-1 rounded-full text-sm font-medium text-gray-500 bg-white flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            Add Location
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className={`w-[20rem] max-w-[calc(100vw-1.5rem)] p-4 ${
        theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200'
      }`}>
        <div className="space-y-3">
          <label className={`text-sm font-medium block ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>Location:</label>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Address, business name, or city"
            onKeyDown={(e) => { if (e.key === 'Enter') save(value); }}
            autoFocus
          />
          <Button onClick={() => save(value)} className="w-full bg-teal-600 hover:bg-teal-700 text-white">
            Save Location
          </Button>
          {task.location && (
            <button
              onClick={() => { setValue(''); save(''); }}
              className="w-full text-center px-3 py-2 text-sm hover:bg-red-50 rounded text-red-600 font-medium"
            >
              Remove location
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}