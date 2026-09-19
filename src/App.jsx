import { useEffect } from 'react';
import './App.css'
import { PomodoroProvider } from '@/context/PomodoroContext'

import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, useNavigate, Navigate } from 'react-router-dom';
import { setupIframeMessaging } from './lib/iframe-messaging';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import Settings from '@/pages/Settings';
import Calendar from '@/pages/Calendar';
import PrivacyPolicyPublic from '@/pages/PrivacyPolicy';
import TermsPublic from '@/pages/Terms';
import LandingPage from '@/pages/LandingPage';
import Home from '@/pages/Home';
import Community from '@/pages/Community';
import BrandBook from '@/pages/BrandBook';
import PressKit from '@/pages/PressKit';
import NotificationDemo from '@/pages/NotificationDemo';
import AdVariantA from '@/pages/AdVariantA';
import AdVariantB from '@/pages/AdVariantB';
import AdVariantC from '@/pages/AdVariantC';
import AdVariantD from '@/pages/AdVariantD';
import AdVariantE from '@/pages/AdVariantE';
import AdVariantF from '@/pages/AdVariantF';
import About from '@/pages/About';
import Birthdays from '@/pages/Birthdays';
import DecisionMaker from '@/pages/DecisionMaker';
import Diary from '@/pages/Diary';
import Places from '@/pages/Places';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import ProtectedRoute from '@/components/ProtectedRoute';
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
  const { isLoadingAuth, isLoadingPublicSettings, isAuthenticated } = useAuth();
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

  // Authentication is enforced by ProtectedRoute on the app routes below —
  // no global redirect firewall. Public pages (landing, legal, brand book,
  // ad spots) sit outside the guard and stay reachable without an account.

  // Render the main app
  return (
    <LaunchProvider>
    <Routes>
      {/* Fully public — no layout wrapper, no auth */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/privacypolicy" element={<PrivacyPolicyPublic />} />
      <Route path="/Terms" element={<TermsPublic />} />
      <Route path="/BrandBook" element={<BrandBook />} />
      <Route path="/PressKit" element={<PressKit />} />
      <Route path="/NotificationDemo" element={<NotificationDemo />} />
      {/* Temporary ad-variant spots for A/B testing — no layout, no auth. */}
      <Route path="/ad/a" element={<AdVariantA />} />
      <Route path="/ad/b" element={<AdVariantB />} />
      <Route path="/ad/c" element={<AdVariantC />} />
      <Route path="/ad/d" element={<AdVariantD />} />
      <Route path="/ad/e" element={<AdVariantE />} />
      <Route path="/ad/f" element={<AdVariantF />} />

      {/* Custom auth pages — public by definition */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Authenticated app with layout — everything below requires login */}
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/Home" element={<LayoutWrapper currentPageName="Home"><Home /></LayoutWrapper>} />
        {Object.entries(Pages).map(([path, Page]) => (
          <Route key={path} path={`/${path}`} element={<LayoutWrapper currentPageName={path}><Page /></LayoutWrapper>} />
        ))}
        <Route path="/settings" element={<LayoutWrapper currentPageName="Settings"><Settings /></LayoutWrapper>} />
        <Route path="/Calendar" element={<LayoutWrapper currentPageName="Calendar"><Calendar /></LayoutWrapper>} />
        <Route path="/Community" element={<LayoutWrapper currentPageName="Community"><Community /></LayoutWrapper>} />
        <Route path="/About" element={<LayoutWrapper currentPageName="About"><About /></LayoutWrapper>} />
        <Route path="/Birthdays" element={<LayoutWrapper currentPageName="Birthdays"><Birthdays /></LayoutWrapper>} />
        <Route path="/DecisionMaker" element={<LayoutWrapper currentPageName="DecisionMaker"><DecisionMaker /></LayoutWrapper>} />
        <Route path="/Diary" element={<LayoutWrapper currentPageName="Diary"><Diary /></LayoutWrapper>} />
        <Route path="/Places" element={<LayoutWrapper currentPageName="Places"><Places /></LayoutWrapper>} />
      </Route>
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