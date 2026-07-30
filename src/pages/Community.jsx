import React, { useState, useEffect } from "react";
import { Users, Sparkles, Heart } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function Community() {
  const [memberCount, setMemberCount] = useState(null);

  useEffect(() => {
    base44.functions
      .invoke("getCommunityCount", {})
      .then((res) => {
        const data = res?.data ?? res;
        if (data && typeof data.count === "number") setMemberCount(data.count);
      })
      .catch(() => setMemberCount(null));
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      <div className="mb-6 w-24 h-24 rounded-full bg-purple-100 flex items-center justify-center">
        <Users className="w-12 h-12 text-purple-500" />
      </div>

      <h1 className="text-3xl font-bold text-gray-900 mb-3">Community</h1>

      <p className="text-xl font-semibold text-purple-600 mb-4">We're building something special ✨</p>

      <p className="text-gray-500 max-w-sm leading-relaxed mb-8">
        A safe, supportive space for people with ADHD to connect, share wins, and cheer each other on.
        We're waiting until we have enough members to make it truly meaningful.
      </p>

      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-xl px-5 py-3">
          <Heart className="w-4 h-4 text-purple-400" />
          <span className="text-purple-700 font-medium text-sm">
            {memberCount != null
              ? `${memberCount.toLocaleString()} ${memberCount === 1 ? "member" : "members"} so far — stay tuned!`
              : "Coming soon — stay tuned!"}
          </span>
          <Sparkles className="w-4 h-4 text-purple-400" />
        </div>
        {memberCount != null && (
          <p className="text-xs text-purple-400/70">We open the doors at 500 members ✨</p>
        )}
      </div>
    </div>
  );
}