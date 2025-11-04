import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function IAPSetupGuide() {
  const [theme, setTheme] = useState(() => localStorage.getItem('adhd_theme') || 'minimalist');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const webhookUrls = [
    { label: 'Apple Webhook', url: 'https://your-app.base44.app/api/appleWebhook' },
    { label: 'Google RTDN', url: 'https://your-app.base44.app/api/googleRTDN' }
  ];

  const envVars = [
    { name: 'APPLE_SHARED_SECRET', description: 'From App Store Connect → App Information' },
    { name: 'ANDROID_PACKAGE_NAME', description: 'e.g., com.adhdone.app' },
    { name: 'GOOGLE_SERVICE_ACCOUNT_KEY', description: 'JSON from Google Cloud Console' },
    { name: 'GOOGLE_PLAY_ACCESS_TOKEN', description: 'OAuth token for API calls' }
  ];

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className={`text-3xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          IAP Setup Guide
        </h1>
        <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
          Complete guide for setting up In-App Purchases
        </p>
      </div>

      <div className="space-y-6">
        <Card className={theme === 'dark' ? 'bg-gray-800' : 'bg-white'}>
          <CardHeader>
            <CardTitle className={theme === 'dark' ? 'text-white' : ''}>Product IDs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900 rounded">
              <span className={theme === 'dark' ? 'text-white' : ''}>com.adhdone.monthly</span>
              <Badge>$5.99/month</Badge>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900 rounded">
              <span className={theme === 'dark' ? 'text-white' : ''}>com.adhdone.yearly</span>
              <Badge>$59.99/year</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className={theme === 'dark' ? 'bg-gray-800' : 'bg-white'}>
          <CardHeader>
            <CardTitle className={theme === 'dark' ? 'text-white' : ''}>Webhook URLs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {webhookUrls.map((webhook) => (
              <div key={webhook.label} className="space-y-1">
                <p className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  {webhook.label}
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={webhook.url}
                    readOnly
                    className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-900 rounded text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(webhook.url, webhook.label)}
                  >
                    {copied === webhook.label ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className={theme === 'dark' ? 'bg-gray-800' : 'bg-white'}>
          <CardHeader>
            <CardTitle className={theme === 'dark' ? 'text-white' : ''}>Environment Variables</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {envVars.map((envVar) => (
              <div key={envVar.name} className="p-3 bg-gray-50 dark:bg-gray-900 rounded">
                <p className={`font-mono text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {envVar.name}
                </p>
                <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                  {envVar.description}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className={theme === 'dark' ? 'bg-gray-800' : 'bg-white'}>
          <CardHeader>
            <CardTitle className={theme === 'dark' ? 'text-white' : ''}>Setup Steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>iOS (App Store)</h3>
              <ol className={`list-decimal list-inside space-y-2 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                <li>Create subscriptions in App Store Connect</li>
                <li>Get Shared Secret from App Information</li>
                <li>Configure webhook URL in Server Notifications</li>
                <li>Create sandbox tester accounts</li>
              </ol>
            </div>

            <div className="space-y-3">
              <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Android (Play Store)</h3>
              <ol className={`list-decimal list-inside space-y-2 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                <li>Create subscription products in Play Console</li>
                <li>Set up Service Account for API access</li>
                <li>Enable Real-time developer notifications</li>
                <li>Add tester emails in License Testing</li>
              </ol>
            </div>

            <div className="space-y-3">
              <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Median Build</h3>
              <ul className={`list-disc list-inside space-y-2 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                <li>Enable iOS IAP Bridge</li>
                <li>Enable Android IAP Bridge</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}