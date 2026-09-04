import React, { useState } from "react";
import { Contacts } from "@capacitor-community/contacts";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import ContactListDialog from "./ContactListDialog";

/**
 * Opens the native contact picker (Android/iOS) to select a contact.
 * Permission is only requested when the user taps the button.
 * On web browsers without the Contact Picker API, the button is hidden
 * and the manual phone number input field serves as the fallback.
 */
export default function ContactPickerButton({ onContactPicked, theme }) {
  const [loading, setLoading] = useState(false);
  const [listContacts, setListContacts] = useState(null);
  const [error, setError] = useState("");

  const isSupported = () => {
    if (typeof window !== "undefined" && window.Capacitor) return true;
    if (typeof navigator !== "undefined" && "contacts" in navigator && navigator.contacts?.select) return true;
    return false;
  };

  if (!isSupported()) return null;

  const normalize = (c) => ({
    name:
      c?.name?.display ||
      [c?.name?.given, c?.name?.family].filter(Boolean).join(" ") ||
      "",
    phone: c?.phones?.[0]?.number || "",
  });

  const handlePick = async () => {
    setLoading(true);
    setError("");
    try {
      // Native (Capacitor)
      if (typeof window !== "undefined" && window.Capacitor) {
        const permStatus = await Contacts.checkPermissions();
        if (permStatus.contacts !== "granted") {
          const reqStatus = await Contacts.requestPermissions();
          if (reqStatus.contacts !== "granted") {
            setError("Contacts permission was denied — you can type the number instead.");
            return;
          }
        }

        // The native picker sheet doesn't open on every Android build, so if it
        // throws or returns nothing we read the list ourselves and show our own
        // picker instead of leaving the button looking dead.
        let picked = null;
        try {
          const result = await Contacts.pickContact({
            projection: { name: true, phones: true },
          });
          if (result?.contact) picked = normalize(result.contact);
        } catch (e) {
          console.warn("Native pickContact unavailable, falling back:", e);
        }

        if (picked && (picked.name || picked.phone)) {
          onContactPicked(picked);
          return;
        }

        const all = await Contacts.getContacts({ projection: { name: true, phones: true } });
        const mapped = (all?.contacts || [])
          .map(normalize)
          .filter((c) => c.name || c.phone)
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        if (mapped.length === 0) {
          setError("No contacts found on this device.");
          return;
        }
        setListContacts(mapped);
        return;
      }

      // Web (Contact Picker API — Chrome Android)
      if ("contacts" in navigator && navigator.contacts?.select) {
        const contacts = await navigator.contacts.select(["name", "tel"], { multiple: false });
        if (contacts && contacts.length > 0) {
          const c = contacts[0];
          onContactPicked({
            name: c.name?.[0] || "",
            phone: c.tel?.[0] || "",
          });
        }
      }
    } catch (e) {
      console.error("Contact picker failed:", e);
      setError(`Couldn't open contacts: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handlePick}
        disabled={loading}
        className={`w-full ${theme === "dark" ? "border-gray-700 text-gray-300" : ""}`}
      >
        <UserPlus className="w-4 h-4 mr-2" />
        {loading ? "Opening contacts…" : "Pick from Contacts"}
      </Button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      <ContactListDialog
        open={!!listContacts}
        contacts={listContacts || []}
        theme={theme}
        onClose={() => setListContacts(null)}
        onSelect={(c) => {
          setListContacts(null);
          onContactPicked(c);
        }}
      />
    </>
  );
}