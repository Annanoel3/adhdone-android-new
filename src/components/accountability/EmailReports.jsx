import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Mail, 
  CheckCircle2,
  Calendar,
  Loader2
} from "lucide-react";
import { AccountabilityReport } from "@/entities/AccountabilityReport";
import { Task } from "@/entities/Task";
import { DailySummary } from "@/entities/DailySummary";
import { SendEmail } from "@/integrations/Core";
import { Badge } from "@/components/ui/badge";

export default function EmailReports({ theme }) {
  const [reportType, setReportType] = useState('weekly');
  const [partnerEmail, setPartnerEmail] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastReport, setLastReport] = useState(null);

  useEffect(() => {
    loadLastReport();
  }, []);

  const loadLastReport = async () => {
    const reports = await AccountabilityReport.list('-created_date', 1);
    if (reports.length > 0) {
      setLastReport(reports[0]);
      setPartnerEmail(reports[0].shared_with || "");
    }
  };

  const generateReport = async () => {
    setIsGenerating(true);

    const endDate = new Date();
    const startDate = new Date();
    
    if (reportType === 'daily') {
      startDate.setDate(endDate.getDate());
    } else {
      startDate.setDate(endDate.getDate() - 7);
    }

    const allTasks = await Task.list();
    const completedTasks = allTasks.filter(t => {
      if (t.status !== 'completed' || !t.completed_at) return false;
      const completedDate = new Date(t.completed_at);
      return completedDate >= startDate && completedDate <= endDate;
    });

    const totalTasks = allTasks.filter(t => {
      const createdDate = new Date(t.created_date);
      return createdDate >= startDate && createdDate <= endDate;
    });

    const completionRate = totalTasks.length > 0 
      ? Math.round((completedTasks.length / totalTasks.length) * 100)
      : 0;

    const summaries = await DailySummary.list('-date', 30);
    const currentStreak = summaries[0]?.streak_days || 0;

    const achievements = [];
    if (completedTasks.length > 0) {
      achievements.push(`✅ Completed ${completedTasks.length} ${completedTasks.length === 1 ? 'task' : 'tasks'}`);
    }
    if (completedTasks.length >= 10) {
      achievements.push("🔥 Completed 10+ tasks - You're on fire!");
    }
    if (completionRate >= 80) {
      achievements.push("⭐ Outstanding completion rate (80%+)");
    }
    if (currentStreak >= 3) {
      achievements.push(`🏆 ${currentStreak} day streak maintained!`);
    }

    const improvements = [];
    if (completionRate < 50) {
      improvements.push("💡 Focus on completing started tasks before adding new ones");
    }

    const reportData = {
      report_type: reportType,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      tasks_completed: completedTasks.length,
      completion_rate: completionRate,
      streak_days: currentStreak,
      top_achievements: achievements.length > 0 ? achievements : ["🌟 Every small step counts!"],
      areas_for_improvement: improvements.length > 0 ? improvements : ["✨ Keep up the great work!"],
      shared_with: partnerEmail || null
    };

    const savedReport = await AccountabilityReport.create(reportData);
    setLastReport(savedReport);

    if (partnerEmail && partnerEmail.includes('@')) {
      const periodText = reportType === 'daily' ? 'Today' : 'This Week';
      const dateRange = reportType === 'daily' 
        ? new Date(reportData.end_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : `${new Date(reportData.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(reportData.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

      const emailBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ADHDone Progress Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; box-sizing: border-box; background-color: #f7f9fc; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 30px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
    .header h1 { margin: 0 0 10px 0; font-size: 28px; font-weight: bold; }
    .header p { margin: 0; opacity: 0.9; font-size: 16px; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px; }
    .stat-card { background: #ffffff; padding: 20px; border-radius: 10px; text-align: center; border: 1px solid #e9ecef; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
    .stat-number { font-size: 32px; font-weight: bold; color: #667eea; margin-bottom: 5px; }
    .stat-label { color: #6c757d; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
    .section { background: #ffffff; border: 1px solid #e9ecef; border-radius: 10px; padding: 25px; margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
    .section h2 { margin: 0 0 15px 0; font-size: 20px; color: #495057; display: flex; align-items: center; gap: 8px; font-weight: bold; }
    .achievement-list, .improvement-list { list-style: none; padding: 0; margin: 0; }
    .achievement-list li, .improvement-list li { padding: 12px 0; border-bottom: 1px solid #f1f3f5; font-size: 15px; color: #555; }
    .achievement-list li:last-child, .improvement-list li:last-child { border-bottom: none; }
    .footer { text-align: center; color: #868e96; font-size: 13px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; }
    .cta { background: #667eea; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; margin-top: 20px; font-weight: bold; }
    @media (max-width: 600px) {
      .stats { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 ${periodText}'s Progress Report</h1>
    <p>${dateRange}</p>
  </div>

  <div class="stats">
    <div class="stat-card">
      <div class="stat-number">${completedTasks.length}</div>
      <div class="stat-label">Tasks Done</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${completionRate}%</div>
      <div class="stat-label">Completion</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${currentStreak}</div>
      <div class="stat-label">Day Streak</div>
    </div>
  </div>

  <div class="section">
    <h2>🏆 Achievements</h2>
    <ul class="achievement-list">
      ${achievements.map(a => `<li>${a}</li>`).join('')}
    </ul>
  </div>

  <div class="section">
    <h2>📈 Growth Opportunities</h2>
    <ul class="improvement-list">
      ${improvements.map(i => `<li>${i}</li>`).join('')}
    </ul>
  </div>

  <div style="text-align: center;">
    <a href="https://adhdone.space" class="cta">View Full Report</a>
  </div>

  <div class="footer">
    <p>This report was generated by <strong>ADHDone</strong></p>
    <p>Empowering people with ADHD to get things done 💪</p>
  </div>
</body>
</html>
      `;

      await SendEmail({
        to: partnerEmail,
        subject: `📊 ${periodText}'s Progress from ADHDone`,
        body: emailBody,
        from_name: "ADHDone"
      });
    }

    setIsGenerating(false);
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Generate Report */}
      <Card className={`border-none shadow-lg ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      }`}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-100' : ''}`}>
            <Mail className="w-5 h-5" />
            Email Progress Report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className={theme === 'dark' ? 'text-gray-200' : ''}>Report Type</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily Report</SelectItem>
                <SelectItem value="weekly">Weekly Report</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className={theme === 'dark' ? 'text-gray-200' : ''}>Send To (Optional)</Label>
            <Input
              type="email"
              value={partnerEmail}
              onChange={(e) => setPartnerEmail(e.target.value)}
              placeholder="partner@example.com"
            />
            <p className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
              We'll email them your report automatically
            </p>
          </div>

          <Button
            onClick={generateReport}
            disabled={isGenerating}
            className={`w-full ${
              theme === 'minimalist' 
                ? 'bg-green-600 hover:bg-green-700' 
                : theme === 'dark'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-700 hover:to-orange-700'
            }`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Mail className="w-4 h-4 mr-2" />
                Generate & Send Report
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Last Report Preview */}
      {lastReport && (
        <Card className={`border-none shadow-lg ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-white'
        }`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-100' : ''}`}>
              <Calendar className="w-5 h-5" />
              Latest Report
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className={`p-3 rounded-lg text-center ${
                theme === 'minimalist' 
                  ? 'bg-green-50' 
                  : 'bg-gradient-to-br from-green-100 to-teal-100'
              }`}>
                <div className="text-2xl font-bold text-gray-900">
                  {lastReport.tasks_completed}
                </div>
                <p className="text-xs text-gray-600 mt-1">Tasks Done</p>
              </div>

              <div className={`p-3 rounded-lg text-center ${
                theme === 'minimalist' 
                  ? 'bg-blue-50' 
                  : 'bg-gradient-to-br from-blue-100 to-purple-100'
              }`}>
                <div className="text-2xl font-bold text-gray-900">
                  {lastReport.completion_rate}%
                </div>
                <p className="text-xs text-gray-600 mt-1">Completed</p>
              </div>
            </div>

            {lastReport.top_achievements && lastReport.top_achievements.length > 0 && (
              <div>
                <h4 className={`font-semibold text-sm mb-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>Achievements</h4>
                <div className="space-y-1">
                  {lastReport.top_achievements.slice(0, 3).map((achievement, index) => (
                    <div key={index} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                      <span className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>{achievement}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Badge variant="outline" className="w-full justify-center">
              {lastReport.report_type.charAt(0).toUpperCase() + lastReport.report_type.slice(1)} • {new Date(lastReport.end_date).toLocaleDateString()}
            </Badge>
          </CardContent>
        </Card>
      )}
    </div>
  );
}