import React, { useState } from "react";
import { registerPlugin } from "@capacitor/core";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

// Native Android picker (ContactPickerBridge). It uses the system contact
// picker intent, so the app needs NO contacts permission at all.
const ContactPickerBridge = registerPlugin("ContactPickerBridge");

/**
 * Opens the native contact picker to select a contact.
 * On web browsers without the Contact Picker API, the button is hidden
 * and the manual phone number input field serves as the fallback.
 */
export default function ContactPickerButton({ onContactPicked, theme }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isSupported = () => {
    if (typeof window !== "undefined" && window.Capacitor) return true;
    if (typeof navigator !== "undefined" && "contacts" in navigator && navigator.contacts?.select) return true;
    return false;
  };

  if (!isSupported()) return null;

  const handlePick = async () => {
    setLoading(true);
    setError("");
    try {
      // Native (Capacitor) — system picker, no permission prompt needed
      if (typeof window !== "undefined" && window.Capacitor) {
        const picked = await ContactPickerBridge.pickContact();
        if (picked?.cancelled) return;
        onContactPicked({
          name: picked?.displayName || "",
          phone: picked?.phoneNumber || "",
        });
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
    </>
  );
}