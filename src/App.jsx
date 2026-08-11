import { useEffect } from 'react';
import './App.css'
import { PomodoroProvider } from '@/context/PomodoroContext'

import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, useNavigate } from 'react-router-dom';
import { setupIframeMessaging } from './lib/iframe-messaging';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Settings from '@/pages/Settings';
import Calendar from '@/pages/Calendar';
import PrivacyPolicyPublic from '@/pages/PrivacyPolicy';
import TermsPublic from '@/pages/Terms';
import LandingPage from '@/pages/LandingPage';
import Home from '@/pages/Home';
import Community from '@/pages/Community';
import BrandBook from '@/pages/BrandBook';
import About from '@/pages/About';
import ScheduledTexts from '@/pages/ScheduledTexts';
import { LaunchProvider } from '@/context/LaunchContext';

// Sentry loaded via CDN in index.html
const Sentry = window.Sentry;
if (Sentry) {
  Sentry.init({
    dsn: "https://d1d855ea4513af56c59c98e1a1dbb3ed@o4511434142580736.ingest.us.sentry.io/4511434182361088",
    environment: "production",
  });
}

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

setupIframeMessaging();

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();
  const navigate = useNavigate();

  // After a Google Calendar app-user OAuth flow, the platform redirects back to
  // the app's default (Home). Bounce the user back to the Calendar page once.
  useEffect(() => {
    if (isAuthenticated && sessionStorage.getItem('adhd_calendar_oauth_return') === '1') {
      sessionStorage.removeItem('adhd_calendar_oauth_return');
      navigate('/Calendar', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Public paths never redirect to login — everything else does
      const publicPaths = ['/', '/privacypolicy', '/Terms', '/BrandBook'];
      if (!publicPaths.includes(window.location.pathname)) {
        navigateToLogin();
        return null;
      }
    }
  }

  // Render the main app
  return (
    <LaunchProvider>
    <Routes>
      {/* Fully public — no layout wrapper, no auth */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/privacypolicy" element={<PrivacyPolicyPublic />} />
      <Route path="/Terms" element={<TermsPublic />} />
      <Route path="/BrandBook" element={<BrandBook />} />

      {/* Authenticated app with layout */}
      <Route path="/Home" element={<LayoutWrapper currentPageName="Home"><Home /></LayoutWrapper>} />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route key={path} path={`/${path}`} element={<LayoutWrapper currentPageName={path}><Page /></LayoutWrapper>} />
      ))}
      <Route path="/settings" element={<LayoutWrapper currentPageName="Settings"><Settings /></LayoutWrapper>} />
      <Route path="/Calendar" element={<LayoutWrapper currentPageName="Calendar"><Calendar /></LayoutWrapper>} />
      <Route path="/Community" element={<LayoutWrapper currentPageName="Community"><Community /></LayoutWrapper>} />
      <Route path="/About" element={<LayoutWrapper currentPageName="About"><About /></LayoutWrapper>} />
      <Route path="/ScheduledTexts" element={<LayoutWrapper currentPageName="ScheduledTexts"><ScheduledTexts /></LayoutWrapper>} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </LaunchProvider>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <PomodoroProvider>
          <Router>
            <NavigationTracker />
            <AuthenticatedApp />
          </Router>
          <Toaster />
          <VisualEditAgent />
        </PomodoroProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App