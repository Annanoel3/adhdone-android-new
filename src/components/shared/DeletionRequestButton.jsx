import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Check, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

// One tap sends the deletion request to the developer by email (no email app).
export default function DeletionRequestButton({ kind = "data", label, className = "", dark = false }) {
  const [me, setMe] = useState(null);
  const [email, setEmail] = useState("");
  const [details, setDetails] = useState("");
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => { base44.auth.me().then(setMe).catch(() => setMe(null)); }, []);

  const send = async () => {
    setState("sending");
    setError("");
    try {
      await base44.functions.invoke("sendDeletionRequest", { kind, email, details });
      setState("sent");
    } catch (e) {
      setError(e?.response?.data?.error || "Couldn't send. Please try again.");
      setState("idle");
    }
  };

  if (state === "sent") {
    return <p className={`flex items-center gap-2 text-sm font-medium ${dark ? "text-green-400" : "text-green-700"}`}><Check className="w-4 h-4" /> Request sent. You'll hear back within the timeframe below.</p>;
  }

  return (
    <div className="space-y-2 w-full max-w-md">
      {!me?.email && <Input type="email" placeholder="The email on your account" value={email} onChange={(e) => setEmail(e.target.value)} />}
      {kind === "data" && <Textarea placeholder="Which data should be deleted? (e.g. all tasks)" value={details} onChange={(e) => setDetails(e.target.value)} />}
      <Button onClick={send} disabled={state === "sending" || (!me?.email && !email.trim())} className={`text-white ${className}`}>
        {state === "sending" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
        {label}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}