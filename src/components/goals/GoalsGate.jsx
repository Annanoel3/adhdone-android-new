import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { goalsEnabled } from "./goalsAccess";

// Every Goals page renders inside this: an account Goals isn't open to
// (goalsAccess.js) that opens /Goals, /Planner or /goal/... by URL is sent
// Home and sees nothing of it.
export default function GoalsGate({ children }) {
  const { user, isLoadingAuth } = useAuth();
  if (isLoadingAuth) return null;
  if (!goalsEnabled(user)) return <Navigate to="/Home" replace />;
  return <>{children}</>;
}
