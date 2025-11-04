
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Trophy, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

export default function TodaysAccomplishments({ tasks, theme, onUncomplete }) {
  const today = new Date().toISOString().split('T')[0];
  
  const completedToday = tasks.filter(t => {
    if (t.status !== 'completed' || !t.completed_at) return false;
    const completedDate = new Date(t.completed_at).toISOString().split('T')[0];
    return completedDate === today;
  });

  const specialMode = localStorage.getItem('special_mode') || 'normal';

  const getUrgencyColor = (urgency) => {
    if (theme === 'minimalist') {
      return {
        low: 'bg-gray-100 text-gray-600',
        medium: 'bg-blue-100 text-blue-700',
        high: 'bg-amber-100 text-amber-700',
        urgent: 'bg-red-100 text-red-700'
      }[urgency];
    } else if (theme === 'dark') {
      return {
        low: 'bg-gray-700 text-gray-300',
        medium: 'bg-blue-700 text-blue-200',
        high: 'bg-amber-700 text-amber-200',
        urgent: 'bg-red-700 text-red-200'
      }[urgency];
    } else {
      return {
        low: 'bg-teal-200 text-teal-800',
        medium: 'bg-purple-200 text-purple-800',
        high: 'bg-orange-200 text-orange-800',
        urgent: 'bg-red-300 text-red-900'
      }[urgency];
    }
  };

  if (completedToday.length === 0) {
    return null;
  }

  return (
    <Card className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} border-none shadow-md ${
      specialMode === 'normal' ? (
        theme === 'minimalist' 
          ? 'bg-gradient-to-br from-green-50 to-emerald-50' 
          : theme === 'dark'
            ? 'bg-gray-800 border border-gray-700'
            : 'bg-gradient-to-br from-purple-100 via-pink-100 to-orange-100'
      ) : ''
    }`}>
      <CardHeader className={`border-b ${specialMode !== 'normal' ? 'border-white/30' : theme === 'dark' ? 'border-gray-700' : 'border-white/50'}`}>
        <CardTitle className="flex items-center gap-2">
          <div className={`p-2 rounded-xl ${
            specialMode !== 'normal' ? '' :
            theme === 'minimalist' ? 'bg-green-200' : theme === 'dark' ? 'bg-green-900/30' : 'bg-white/80'
          }`}>
            <Trophy className={`w-5 h-5 ${
              specialMode !== 'normal' ? '' :
              theme === 'minimalist' ? 'text-green-700' : theme === 'dark' ? 'text-green-400' : 'text-purple-600'
            }`} />
          </div>
          <div>
            <span className={theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}>Today's Accomplishments</span>
            <p className={`text-sm font-normal mt-0.5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              You've completed {completedToday.length} task{completedToday.length !== 1 ? 's' : ''} today! 🎉
            </p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <AnimatePresence>
          <div className="space-y-3">
            {completedToday.map((task, index) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.1 }}
                className={`${specialMode !== 'normal' ? `${specialMode}-card` : ''} p-4 rounded-xl border transition-all duration-200 hover:shadow-md ${
                  specialMode === 'normal' ? (
                    theme === 'minimalist' 
                      ? 'bg-white/80 border-green-200' 
                      : theme === 'dark'
                        ? 'bg-gray-900/50 border-gray-700'
                        : 'bg-white/60 border-purple-200'
                  ) : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`mt-1 ${
                      theme === 'minimalist' ? 'text-green-600' : theme === 'dark' ? 'text-green-400' : 'text-purple-600'
                    }`}>
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <h4 className={`font-medium mb-2 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{task.title}</h4>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={getUrgencyColor(task.urgency)}>
                          {task.urgency}
                        </Badge>
                        <Badge variant="outline" className={`text-xs ${theme === 'dark' ? 'bg-gray-700 text-gray-300 border-gray-600' : ''}`}>
                          {new Date(task.completed_at).toLocaleTimeString('en-US', { 
                            hour: 'numeric', 
                            minute: '2-digit' 
                          })}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onUncomplete(task)}
                    className={`flex-shrink-0 ${theme === 'dark' ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                    title="Undo completion"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
