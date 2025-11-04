
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone, Check } from "lucide-react";

export default function InstallInstructions() {
  const [theme, setTheme] = React.useState(() => localStorage.getItem('adhd_theme') || 'minimalist');

  React.useEffect(() => {
    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('adhd_theme') || 'minimalist';
      setTheme(newTheme);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
          theme === 'minimalist' 
            ? 'bg-gradient-to-br from-green-100 to-blue-100' 
            : theme === 'dark'
              ? 'bg-gradient-to-br from-green-900 to-blue-900'
              : 'bg-gradient-to-br from-purple-200 to-pink-200'
        }`}>
          <Smartphone className={`w-8 h-8 ${
            theme === 'minimalist' ? 'text-green-600' : theme === 'dark' ? 'text-green-400' : 'text-purple-700'
          }`} />
        </div>
        <h1 className={`text-3xl font-bold mb-2 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
          Install ADHDone on Your Phone
        </h1>
        <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
          Get the full app experience right from your home screen
        </p>
      </div>

      <div className="space-y-6">
        <Card className={`border-none shadow-lg ${
          theme === 'minimalist' 
            ? 'bg-white/90 backdrop-blur-sm' 
            : theme === 'dark'
              ? 'bg-gray-800/90 backdrop-blur-sm'
              : 'bg-gradient-to-br from-purple-50 to-pink-50'
        }`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-100' : ''}`}>
              <span className="text-2xl">🍎</span>
              For iPhone/iPad Users
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                theme === 'minimalist' ? 'bg-green-100' : theme === 'dark' ? 'bg-green-900/30' : 'bg-purple-200'
              }`}>
                <span className={`text-sm font-bold ${
                  theme === 'minimalist' ? 'text-green-700' : theme === 'dark' ? 'text-green-400' : 'text-purple-700'
                }`}>1</span>
              </div>
              <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                Open this page in <strong>Safari</strong> (must be Safari, not Chrome)
              </p>
            </div>

            <div className="flex items-start gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                theme === 'minimalist' ? 'bg-green-100' : theme === 'dark' ? 'bg-green-900/30' : 'bg-purple-200'
              }`}>
                <span className={`text-sm font-bold ${
                  theme === 'minimalist' ? 'text-green-700' : theme === 'dark' ? 'text-green-400' : 'text-purple-700'
                }`}>2</span>
              </div>
              <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                Tap the <strong>Share button</strong> <span className="inline-block">⬆️</span> at the bottom of the screen
              </p>
            </div>

            <div className="flex items-start gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                theme === 'minimalist' ? 'bg-green-100' : theme === 'dark' ? 'bg-green-900/30' : 'bg-purple-200'
              }`}>
                <span className={`text-sm font-bold ${
                  theme === 'minimalist' ? 'text-green-700' : theme === 'dark' ? 'text-green-400' : 'text-purple-700'
                }`}>3</span>
              </div>
              <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                Scroll down and tap <strong>"Add to Home Screen"</strong>
              </p>
            </div>

            <div className="flex items-start gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                theme === 'minimalist' ? 'bg-green-100' : theme === 'dark' ? 'bg-green-900/30' : 'bg-purple-200'
              }`}>
                <span className={`text-sm font-bold ${
                  theme === 'minimalist' ? 'text-green-700' : theme === 'dark' ? 'text-green-400' : 'text-purple-700'
                }`}>4</span>
              </div>
              <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                Name it "ADHDone" and tap <strong>"Add"</strong>
              </p>
            </div>

            <div className="flex items-start gap-3">
              <Check className={`w-6 h-6 flex-shrink-0 ${
                theme === 'minimalist' ? 'text-green-600' : theme === 'dark' ? 'text-green-400' : 'text-purple-600'
              }`} />
              <p className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                Done! The app is now on your home screen
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className={`border-none shadow-lg ${
          theme === 'minimalist' 
            ? 'bg-white/90 backdrop-blur-sm' 
            : theme === 'dark'
              ? 'bg-gray-800/90 backdrop-blur-sm'
              : 'bg-gradient-to-br from-blue-50 to-teal-50'
        }`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-100' : ''}`}>
              <span className="text-2xl">🤖</span>
              For Android Users
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                theme === 'minimalist' ? 'bg-blue-100' : theme === 'dark' ? 'bg-blue-900/30' : 'bg-teal-200'
              }`}>
                <span className={`text-sm font-bold ${
                  theme === 'minimalist' ? 'text-blue-700' : theme === 'dark' ? 'text-blue-400' : 'text-teal-700'
                }`}>1</span>
              </div>
              <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                Open this page in <strong>Chrome</strong> (must be Chrome)
              </p>
            </div>

            <div className="flex items-start gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                theme === 'minimalist' ? 'bg-blue-100' : theme === 'dark' ? 'bg-blue-900/30' : 'bg-teal-200'
              }`}>
                <span className={`text-sm font-bold ${
                  theme === 'minimalist' ? 'text-blue-700' : theme === 'dark' ? 'text-blue-400' : 'text-teal-700'
                }`}>2</span>
              </div>
              <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                Tap the <strong>three-dot menu (⋮)</strong> in the top right corner
              </p>
            </div>

            <div className="flex items-start gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                theme === 'minimalist' ? 'bg-blue-100' : theme === 'dark' ? 'bg-blue-900/30' : 'bg-teal-200'
              }`}>
                <span className={`text-sm font-bold ${
                  theme === 'minimalist' ? 'text-blue-700' : theme === 'dark' ? 'text-blue-400' : 'text-teal-700'
                }`}>3</span>
              </div>
              <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                Tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong>
              </p>
            </div>

            <div className="flex items-start gap-3">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                theme === 'minimalist' ? 'bg-blue-100' : theme === 'dark' ? 'bg-blue-900/30' : 'bg-teal-200'
              }`}>
                <span className={`text-sm font-bold ${
                  theme === 'minimalist' ? 'text-blue-700' : theme === 'dark' ? 'text-blue-400' : 'text-teal-700'
                }`}>4</span>
              </div>
              <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
                Confirm by tapping <strong>"Install"</strong> or <strong>"Add"</strong>
              </p>
            </div>

            <div className="flex items-start gap-3">
              <Check className={`w-6 h-6 flex-shrink-0 ${
                theme === 'minimalist' ? 'text-blue-600' : theme === 'dark' ? 'text-blue-400' : 'text-teal-600'
              }`} />
              <p className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                Done! The app is now on your home screen
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className={`border-none shadow-md ${
          theme === 'minimalist' 
            ? 'bg-gradient-to-r from-green-50 to-blue-50' 
            : theme === 'dark'
              ? 'bg-gradient-to-r from-green-900/20 to-blue-900/20'
              : 'bg-gradient-to-r from-purple-100 to-orange-100'
        }`}>
          <CardContent className="p-6">
            <h3 className={`font-semibold mb-2 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
              Why install the app?
            </h3>
            <ul className={`space-y-1 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
              <li>✓ Opens full-screen like a real app</li>
              <li>✓ Quick access from your home screen</li>
              <li>✓ Works offline (after first load)</li>
              <li>✓ No more browser tabs to manage</li>
              <li>✓ Feels just like a native app</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
