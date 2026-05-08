import { useEffect } from 'react';
import { User } from "@/entities/User";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function AuthBootstrap() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    checkAuth();
  }, [location.pathname]);

  const checkAuth = async () => {
    if (location.pathname === createPageUrl("AuthCallback")) {
      return;
    }
    try {
      await User.me();
      if (location.pathname.includes('/login') || location.pathname.includes('/auth')) {
        navigate(createPageUrl("Home"));
      }
    } catch (error) {
      // Not authenticated — let individual pages handle redirect
    }
  };

  return null;
}
