
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Bug, Send, Loader2, CheckCircle2 } from "lucide-react";
import { SendEmail } from "@/integrations/Core";
import { User } from "@/entities/User";
import { Task } from "@/entities/Task";

export default function ReportBug() {
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [bugDescription, setBugDescription] = useState("");
  const [stepsToReproduce, setStepsToReproduce] = useState("");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!bugDescription.trim()) return;

    setIsSubmitting(true);

    try {
      // Gather context
      const user = await User.me();
      const tasks = await Task.list('-created_date', 5);
      
      const browserInfo = `${navigator.userAgent}`;
      const screenSize = `${window.innerWidth}x${window.innerHeight}`;
      const currentPage = window.location.pathname;

      // Compose email
      const emailBody = `
🐛 BUG REPORT

USER INFORMATION:
- Name: ${user.full_name}
- Email: ${user.email}
- User Level: ${user.level || 1}
- Premium: ${user.is_premium ? 'Yes' : 'No'}

SYSTEM INFORMATION:
- Browser: ${browserInfo}
- Screen Size: ${screenSize}
- Current Page: ${currentPage}
- Theme: ${theme}
- Timestamp: ${new Date().toISOString()}

BUG DESCRIPTION:
${bugDescription}

${stepsToReproduce ? `STEPS TO REPRODUCE:
${stepsToReproduce}` : ''}

${expectedBehavior ? `EXPECTED BEHAVIOR:
${expectedBehavior}` : ''}

RECENT TASKS (for context):
${tasks.length > 0 ? tasks.map(t => `- ${t.title} (${t.status})`).join('\n') : 'No recent tasks'}
      `;

      await SendEmail({
        to: "adhdone.space@gmail.com",
        subject: `🐛 Bug Report - ADHDone App`,
        body: emailBody,
        from_name: "ADHDone Bug Reporter"
      });

      setSubmitted(true);
      setBugDescription("");
      setStepsToReproduce("");
      setExpectedBehavior("");

      // Reset after 3 seconds
      setTimeout(() => {
        setSubmitted(false);
      }, 3000);
    } catch (error) {
      console.error("Error submitting bug report:", error);
      alert("Failed to submit bug report. Please try again.");
    }

    setIsSubmitting(false);
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
          theme === 'minimalist' 
            ? 'bg-gradient-to-br from-red-100 to-orange-100' 
            : theme === 'dark'
              ? 'bg-gradient-to-br from-red-900 to-orange-900'
              : 'bg-gradient-to-br from-red-200 to-orange-200'
        }`}>
          <Bug className={`w-8 h-8 ${
            theme === 'minimalist' ? 'text-red-600' : theme === 'dark' ? 'text-red-400' : 'text-red-700'
          }`} />
        </div>
        <h1 className={`text-3xl font-bold mb-2 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>Report a Bug</h1>
        <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
          Help us improve by reporting any issues you encounter
        </p>
      </div>

      {submitted ? (
        <Card className={`border-none shadow-lg ${
          theme === 'minimalist' 
            ? 'bg-green-50' 
            : theme === 'dark'
              ? 'bg-green-900/20'
              : 'bg-gradient-to-br from-green-100 to-teal-100'
        }`}>
          <CardContent className="p-12 text-center">
            <CheckCircle2 className={`w-16 h-16 mx-auto mb-4 ${
              theme === 'minimalist' ? 'text-green-600' : theme === 'dark' ? 'text-green-400' : 'text-green-700'
            }`} />
            <h2 className={`text-2xl font-bold mb-2 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
              Thank you!
            </h2>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              Your bug report has been sent. We'll look into it as soon as possible.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className={`border-none shadow-lg ${
          theme === 'minimalist' 
            ? 'bg-white/90 backdrop-blur-sm' 
            : theme === 'dark'
              ? 'bg-gray-800/90 backdrop-blur-sm'
              : 'bg-gradient-to-br from-red-50 to-orange-50'
        }`}>
          <CardHeader>
            <CardTitle className={theme === 'dark' ? 'text-gray-100' : ''}>
              What went wrong?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="description" className={theme === 'dark' ? 'text-gray-200' : ''}>
                  Bug Description *
                </Label>
                <Textarea
                  id="description"
                  value={bugDescription}
                  onChange={(e) => setBugDescription(e.target.value)}
                  placeholder="Describe what happened... be as specific as possible"
                  className="min-h-[120px] text-base"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="steps" className={theme === 'dark' ? 'text-gray-200' : ''}>
                  Steps to Reproduce (Optional)
                </Label>
                <Textarea
                  id="steps"
                  value={stepsToReproduce}
                  onChange={(e) => setStepsToReproduce(e.target.value)}
                  placeholder="1. I clicked on...&#10;2. Then I...&#10;3. And then..."
                  className="min-h-[100px] text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expected" className={theme === 'dark' ? 'text-gray-200' : ''}>
                  What Did You Expect to Happen? (Optional)
                </Label>
                <Textarea
                  id="expected"
                  value={expectedBehavior}
                  onChange={(e) => setExpectedBehavior(e.target.value)}
                  placeholder="I expected..."
                  className="min-h-[80px] text-base"
                />
              </div>

              <div className={`p-4 rounded-lg text-sm ${
                theme === 'minimalist' 
                  ? 'bg-blue-50 border border-blue-200' 
                  : theme === 'dark'
                    ? 'bg-blue-900/20 border border-blue-800'
                    : 'bg-blue-100 border border-blue-200'
              }`}>
                <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                  We'll automatically include your user info and browser details to help us debug the issue.
                </p>
              </div>

              <Button
                type="submit"
                disabled={!bugDescription.trim() || isSubmitting}
                className={`w-full ${
                  theme === 'minimalist' 
                    ? 'bg-red-600 hover:bg-red-700' 
                    : theme === 'dark'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Submit Bug Report
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
