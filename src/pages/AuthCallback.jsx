import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User } from "@/entities/User";
import { createPageUrl } from "@/utils";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState(null);

  useEffect(() => {
    handleAuthRedirect();
  }, []);

  const handleAuthRedirect = async () => {
    try {
      // Wait a moment for Base44 to process the OAuth callback
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Try to verify authentication
      const user = await User.me();
      
      if (user) {
        console.log("User authenticated successfully:", user.email);
        setStatus('success');
        
        // Redirect to home after showing success
        setTimeout(() => {
          window.location.href = createPageUrl("Home");
        }, 1000);
      } else {
        throw new Error("User not found after authentication");
      }
    } catch (error) {
      console.error("Auth callback error:", error);
      setError(error.message);
      setStatus('error');
      
      // If authentication failed, try redirecting to login again
      setTimeout(async () => {
        try {
          const callbackUrl = window.location.origin + createPageUrl("AuthCallback");
          await User.loginWithRedirect(callbackUrl);
        } catch (loginError) {
          // If login redirect fails, just go to home
          window.location.href = createPageUrl("Home");
        }
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-orange-50 to-teal-50">
      <div className="text-center max-w-md p-8">
        {status === 'processing' && (
          <>
            <Loader2 className="w-16 h-16 mx-auto mb-4 animate-spin text-purple-600" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Completing sign-in...
            </h2>
            <p className="text-gray-600">
              Just a moment while we set up your session
            </p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Welcome back! 🎉
            </h2>
            <p className="text-gray-600">
              Taking you to your dashboard...
            </p>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Authentication Issue
            </h2>
            <p className="text-gray-600 mb-4">
              {error || "Something went wrong. Let's try again..."}
            </p>
            <p className="text-sm text-gray-500">
              Redirecting you to login...
            </p>
          </>
        )}
      </div>
    </div>
  );
}