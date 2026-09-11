import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";

// Diary photos live in PRIVATE storage, so each one needs a short-lived signed
// URL before it can be displayed.
export default function PrivateImage({ fileUri, className }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let active = true;
    base44.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri, expires_in: 3600 })
      .then((res) => {
        if (active) setUrl(res?.signed_url || null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [fileUri]);

  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
      </div>
    );
  }

  return <img src={url} alt="Diary photo" className={className} />;
}