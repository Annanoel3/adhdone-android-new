
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function CronSetup() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [oneSignalStatus, setOneSignalStatus] = useState(null);

  // Define baseUrl for cron job URLs.
  // IMPORTANT: Replace 'YOUR_CLOUD_FUNCTIONS_BASE_URL' with the actual base URL
  // for your Google Cloud Functions, typically something like:
  // 'https://us-central1-your-project-id.cloudfunctions.net'
  const baseUrl = 'YOUR_CLOUD_FUNCTIONS_BASE_URL';

  const cronJobs = [
    {
      name: 'Task Reminders',
      schedule: '*/5 * * * *',
      url: `${baseUrl}/functions/cronTaskReminders`,
      description: 'Send task reminder notifications (every 5 minutes)'
    },
    {
      name: 'Trial Warnings',
      schedule: '0 19 * * *',
      url: `${baseUrl}/functions/cronTrialWarnings`,
      description: 'Check and send trial ending warnings (7 PM daily)'
    },
    {
      name: 'Weekly Recap',
      schedule: '0 18 * * 0',
      url: `${baseUrl}/functions/cronWeeklyRecap`,
      description: 'Send weekly progress recap to accountability partners (6 PM Sunday)'
    },
    {
      name: 'Smart Motivation',
      schedule: '0 18 * * *',
      url: `${baseUrl}/functions/cronSmartMotivation`,
      description: 'Send personalized daily motivation (6 PM daily)'
    },
    {
      name: 'Cleanup Focus Rooms',
      schedule: '0 */6 * * *',
      url: `${baseUrl}/functions/cronCleanupFocusRooms`,
      description: 'Clean up inactive focus rooms (every 6 hours)'
    },
    {
      name: 'Daily Tips Cleanup',
      schedule: '0 0 * * *',
      url: `${baseUrl}/functions/cronDailyTips`,
      description: 'Reset daily tips at midnight (12 AM daily)'
    }
  ];

  const checkOneSignal = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('checkMyOneSignalStatus');
      setOneSignalStatus(response.data.diagnostics);
    } catch (error) {
      setOneSignalStatus({ error: error.message });
    }
    setLoading(false);
  };

  const forceRegisterDevice = async () => {
    setLoading(true);
    setStatus(null);
    
    try {
      // Check if we're in Capacitor (native app)
      const OneSignal = window?.plugins?.OneSignal;
      
      if (!OneSignal) {
        setStatus({
          success: false,
          message: "Not running in native app. OneSignal only works in the mobile app."
        });
        setLoading(false);
        return;
      }

      // Get device state
      OneSignal.getDeviceState(async (state) => {
        console.log('[Manual] Device state:', state);
        
        if (!state?.userId) {
          setStatus({
            success: false,
            message: "No player ID found. Make sure notifications are enabled in device settings."
          });
          setLoading(false);
          return;
        }

        // Try to save player ID
        try {
          const saveResponse = await base44.functions.invoke('saveMyPlayerId', {
            playerId: state.userId
          });
          
          console.log('[Manual] Save response:', saveResponse);
          
          setStatus({
            success: true,
            message: `Successfully registered device! Player ID: ${state.userId}`,
            details: saveResponse.data
          });
        } catch (error) {
          setStatus({
            success: false,
            message: "Failed to save player ID",
            error: error.message
          });
        }
        
        setLoading(false);
      });
    } catch (error) {
      setStatus({
        success: false,
        message: "Error during registration",
        error: error.message
      });
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>OneSignal Setup & Diagnostics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Step 1: Check Status</h3>
            <Button onClick={checkOneSignal} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Check OneSignal Status
            </Button>
            
            {oneSignalStatus && (
              <Alert className="mt-4">
                <AlertDescription>
                  <div className="space-y-2 text-sm">
                    <div><strong>Email:</strong> {oneSignalStatus.user_email}</div>
                    <div><strong>Player IDs:</strong> {oneSignalStatus.player_id_count || 0}</div>
                    <div><strong>App ID Set:</strong> {oneSignalStatus.has_app_id ? '✓' : '✗'}</div>
                    <div><strong>REST Key Set:</strong> {oneSignalStatus.has_rest_key ? '✓' : '✗'}</div>
                    {oneSignalStatus.saved_player_ids?.length > 0 && (
                      <div>
                        <strong>Registered Devices:</strong>
                        <ul className="ml-4 mt-1">
                          {oneSignalStatus.saved_player_ids.map((id, i) => (
                            <li key={i} className="font-mono text-xs">{id}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div>
            <h3 className="font-semibold mb-2">Step 2: Register This Device (Mobile Only)</h3>
            <p className="text-sm text-gray-600 mb-3">
              This will manually register your current device with OneSignal. 
              Only works in the mobile app, not in browser.
            </p>
            <Button onClick={forceRegisterDevice} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Register This Device
            </Button>

            {status && (
              <Alert className={`mt-4 ${status.success ? 'border-green-500' : 'border-red-500'}`}>
                <div className="flex items-start gap-2">
                  {status.success ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <AlertDescription>
                      <div className="font-semibold mb-1">{status.message}</div>
                      {status.error && (
                        <div className="text-sm text-red-600 mt-2">Error: {status.error}</div>
                      )}
                      {status.details && (
                        <div className="text-sm mt-2">
                          <div>Total Devices: {status.details.totalDevices}</div>
                        </div>
                      )}
                    </AlertDescription>
                  </div>
                </div>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
