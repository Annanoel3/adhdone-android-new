import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function TrialWarningModal({ isOpen, onClose, theme }) {
  const navigate = useNavigate();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`max-w-md ${
        theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''
      }`}>
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            <AlertTriangle className="w-6 h-6 text-amber-600" />
            Trial Ending Soon
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          <div className={`p-4 rounded-lg ${
            theme === 'dark' 
              ? 'bg-amber-900/20 border border-amber-800' 
              : 'bg-amber-50 border border-amber-200'
          }`}>
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className={`font-medium mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  Your trial expires tomorrow
                </p>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  You have 1 day remaining to decide if ADHDone is right for you.
                </p>
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <Button
              onClick={() => {
                navigate(createPageUrl("Subscribe"));
                onClose();
              }}
              className={`w-full ${
                theme === 'minimalist' 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : theme === 'dark'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700'
              }`}
            >
              Learn About Full Access
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              className="w-full"
            >
              Remind Me Tomorrow
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}