// Trial ended page disabled - redirects home
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function TrialEnded() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(createPageUrl("Home"), { replace: true });
  }, [navigate]);
  return null;
}