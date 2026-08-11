import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import ScheduledTextsList from "../components/scheduledtexts/ScheduledTextsList";

export default function ScheduledTexts() {
  const [tasks, setTasks] = useState([]);
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("adhd_theme") || "minimalist");
  const specialMode = localStorage.getItem("special_mode") || "normal";

  const loadTasks = async () => {
    try {
      const allTasks = await base44.entities.Task.list("-updated_date", 500);
      setTasks(allTasks);
    } catch (error) {
      console.error("Error loading tasks:", error);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const u = await base44.auth.me();
        setUser(u);
      } catch (e) {
        console.error("Error loading user:", e);
      }
      await loadTasks();
    })();
    const handler = () => loadTasks();
    window.addEventListener("tasks-changed", handler);
    return () => window.removeEventListener("tasks-changed", handler);
  }, []);

  return (
    <div className="p-4 md:p-8 w-full" style={{ paddingBottom: "max(8rem, calc(8rem + env(safe-area-inset-bottom)))" }}>
      <div className="max-w-3xl mx-auto">
        <h1 className={`text-2xl font-bold mb-6 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
          Scheduled Texts 📞
        </h1>
        <ScheduledTextsList
          tasks={tasks}
          user={user}
          theme={theme}
          specialMode={specialMode}
          onRefresh={loadTasks}
        />
      </div>
    </div>
  );
}