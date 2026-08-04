import React, { useState } from "react";
import { Contacts } from "@capacitor-community/contacts";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Opens the native contact picker (Android/iOS) to select a contact.
 * Permission is only requested when the user taps the button.
 * On web browsers without the Contact Picker API, the button is hidden
 * and the manual phone number input field serves as the fallback.
 */
export default function ContactPickerButton({ onContactPicked, theme }) {
  const [loading, setLoading] = useState(false);

  const isSupported = () => {
    if (typeof window !== "undefined" && window.Capacitor) return true;
    if (typeof navigator !== "undefined" && "contacts" in navigator && navigator.contacts?.select) return true;
    return false;
  };

  if (!isSupported()) return null;

  const handlePick = async () => {
    setLoading(true);
    try {
      // Native (Capacitor)
      if (typeof window !== "undefined" && window.Capacitor) {
        const permStatus = await Contacts.checkPermissions();
        if (permStatus.contacts !== "granted") {
          const reqStatus = await Contacts.requestPermissions();
          if (reqStatus.contacts !== "granted") return;
        }

        const result = await Contacts.pickContact({
          projection: { name: true, phones: true },
        });

        const c = result.contact;
        const name =
          c.name?.display ||
          [c.name?.given, c.name?.family].filter(Boolean).join(" ") ||
          "";
        const phone = c.phones?.[0]?.number || "";

        onContactPicked({ name, phone });
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
    } finally {
      setLoading(false);
    }
  };

  return (
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
  );
}