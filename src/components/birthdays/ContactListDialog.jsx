import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * In-app fallback contact picker. Used when the native pickContact sheet
 * isn't available on the device — we read the contact list ourselves and let
 * the user search/tap one.
 */
export default function ContactListDialog({ open, onClose, contacts, onSelect, theme }) {
  const [query, setQuery] = useState("");

  const filtered = contacts.filter((c) =>
    !query.trim() ? true : (c.name || "").toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={`max-w-md ${theme === "dark" ? "bg-gray-900 text-white border-gray-700" : ""}`}>
        <DialogHeader>
          <DialogTitle>Pick a contact</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search contacts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={theme === "dark" ? "bg-gray-800 border-gray-700 text-white" : ""}
        />
        <div className="max-h-[50vh] overflow-y-auto mt-2 space-y-1">
          {filtered.length === 0 && (
            <p className="text-sm text-center py-6 opacity-70">No contacts found.</p>
          )}
          {filtered.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(c)}
              className={`w-full text-left px-3 py-2 rounded-lg ${
                theme === "dark" ? "hover:bg-gray-800" : "hover:bg-gray-100"
              }`}
            >
              <span className="font-medium">{c.name || "(no name)"}</span>
              {c.phone && <span className="block text-xs opacity-70">{c.phone}</span>}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}