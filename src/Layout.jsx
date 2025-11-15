
import React, { useState, useEffect, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  LayoutDashboard,
  ListTodo,
  Timer,
  MessageCircleHeart,
  Lightbulb,
  Sun,
  Moon,
  TrendingUp,
  Share2,
  Bug,
  LogOut,
  User as UserIcon,
  Trophy,
  Users,
  ChevronDown,
  ChevronRight,
  Settings,
  MessageCircle,
  Bell,
  Sparkles,
  Mic,
  HelpCircle,
  Shield,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import EnergyCheckInModal from "./components/shared/EnergyCheckInModal";
import TrialWarningModal from "./components/shared/TrialWarningModal";
import UniversalVoiceAssistant from "./components/shared/UniversalVoiceAssistant";
import MicrophonePermissionCheck from "./components/shared/MicrophonePermissionCheck";
import PokeNotification from "./components/shared/PokeNotification";
import AppGuideModal from "./components/shared/AppGuideModal";
import { base44 } from "@/api/base44Client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import KawaiiMode from "./components/shared/KawaiiMode";
import HalloweenMode from "./components/shared/HalloweenMode";
import FallMode from "./components/shared/FallMode";
import WinterMode from "./components/shared/WinterMode";
import ChristmasMode from "./components/shared/ChristmasMode";
import ValentinesMode from "./components/shared/ValentinesMode";
import NewYearsMode from "./components/shared/NewYearsMode";
import StPatricksMode from "./components/shared/StPatricksMode";
import FourthJulyMode from "./components/shared/FourthJulyMode";
import SummerMode from "./components/shared/SummerMode";
import SpringMode from "./components/shared/SpringMode";
import OneSignalInit from "./components/shared/OneSignalInit";
import {
  Tooltip,
  TooltipProvider,
} from "@/components/ui/tooltip";
import EasterEggVideo from "./components/shared/EasterEggVideo";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

function LayoutContent({ children, currentPageName, user, authCheckComplete }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('adhd_theme') || 'minimalist';
  });
  const [showEnergyCheckIn, setShowEnergyCheckIn] = useState(false);
  const [showTrialWarning, setShowTrialWarning] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);
  const [accountabilityNotifications, setAccountabilityNotifications] = useState(0);
  const [specialMode, setSpecialMode] = useState(() => {
    const stored = localStorage.getItem('special_mode');
    return stored || 'normal';
  });
  const [showAppGuide, setShowAppGuide] = useState(false);
  const [showSpicyBrainsExplanation, setShowSpicyBrainsExplanation] = useState(false);

  useEffect(() => {
    localStorage.setItem('adhd_theme', theme);
  }, [theme]);

  useEffect(() => {
    const mode = localStorage.getItem('special_mode') || 'normal';
    localStorage.setItem('special_mode', mode);
    document.documentElement.setAttribute('data-theme', mode);
  }, [specialMode]);

  const loadAccountabilityNotifications = async () => {
    if (!user || !user.email || !authCheckComplete) {
      setAccountabilityNotifications(0);
      return;
    }

    try {
      const connections = await base44.entities.AccountabilityConnection.filter({
        recipient_email: user.email,
        status: 'pending'
      });
      setAccountabilityNotifications(connections.length);
    } catch (error) {
      console.error("Error loading accountability notifications:", error);
      setAccountabilityNotifications(0);
    }
  };

  useEffect(() => {
    if (user && user.email && authCheckComplete) {
      loadAccountabilityNotifications();
      const interval = setInterval(loadAccountabilityNotifications, 30000);
      return () => clearInterval(interval);
    } else {
      setAccountabilityNotifications(0);
    }
  }, [user, authCheckComplete]);

  useEffect(() => {
    const checkEnergyCheckIn = () => {
      const now = new Date();
      const currentHour = now.getHours();
      
      if (currentHour < 8 || currentHour >= 20) {
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const lastCheckInDate = localStorage.getItem('last_energy_checkin_date');
      const checkInCount = parseInt(localStorage.getItem('energy_checkin_count') || '0');

      if (lastCheckInDate !== today) {
        localStorage.setItem('energy_checkin_count', '0');
        localStorage.setItem('last_energy_checkin_date', today);
      }

      if (checkInCount >= 2) {
        return;
      }

      const lastCheckIn = localStorage.getItem('last_energy_checkin_time');
      const nowTime = new Date().getTime();
      const fourHours = 4 * 60 * 60 * 1000;

      if (lastCheckIn && nowTime - parseInt(lastCheckIn) < fourHours) {
        return;
      }

      setTimeout(() => {
        setShowEnergyCheckIn(true);
        localStorage.setItem('last_energy_checkin_time', nowTime.toString());
        localStorage.setItem('energy_checkin_count', (checkInCount + 1).toString());
      }, 5 * 60 * 1000);
    };

    checkEnergyCheckIn();
  }, []);

  // Android back button handler
  useEffect(() => {
    const handleBackButton = async () => {
      try {
        // Dynamic import to avoid build errors (Capacitor is added during APK build)
        const capacitorModule = await import('@capacitor/app');
        const { App } = capacitorModule;
        
        App.addListener('backButton', ({ canGoBack }) => {
          if (currentPageName === 'Home') {
            App.exitApp();
          } else {
            navigate(createPageUrl('Home'));
          }
        });

        return () => {
          App.removeAllListeners();
        };
      } catch (error) {
        // Capacitor not available in web build - this is expected
        console.log('Capacitor App not available');
      }
    };

    handleBackButton();
  }, [currentPageName, navigate]);

  const toggleTheme = () => {
    const currentSpecialMode = specialMode;
    if (currentSpecialMode !== 'normal') {
      localStorage.setItem('special_mode', 'normal');
      setSpecialMode('normal');
      setTimeout(() => {
        window.location.reload();
      }, 100);
      return;
    }

    setTheme(prev => {
      let nextTheme;
      if (prev === 'minimalist') {
        nextTheme = 'dark';
      } else if (prev === 'dark') {
        nextTheme = 'colorful';
      } else if (prev === 'colorful') {
        nextTheme = 'spicybrains';
      } else {
        nextTheme = 'minimalist';
      }

      if (nextTheme === 'spicybrains') {
        const hasSeenExplanation = localStorage.getItem('spicybrains_explanation_seen');
        if (!hasSeenExplanation) {
          setTimeout(() => {
            setShowSpicyBrainsExplanation(true);
            localStorage.setItem('spicybrains_explanation_seen', 'true');
          }, 500);
        }
      }
      return nextTheme;
    });
  };

  const handleLogout = async () => {
    try {
      await base44.auth.logout();
      window.location.reload();
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  const isSeasonalTheme = () => {
    return ['christmas', 'valentines', 'newyears', 'stpatricks', 'fourthjuly', 'summer', 'spring', 'kawaii', 'halloween', 'fall', 'winter'].includes(specialMode);
  };

  const getBackgroundClass = () => {
    if (theme === 'dark') return 'bg-[#0a0a0b]';
    if (theme === 'minimalist') return 'bg-gradient-to-br from-stone-50 via-sage-50 to-stone-100';
    if (theme === 'spicybrains') return '';
    return 'bg-gradient-to-br from-purple-50 via-orange-50 to-teal-50';
  };

  const getSpecialModeCardClass = useCallback(() => {
    if (specialMode === 'normal') return '';
    return `${specialMode}-card`;
  }, [specialMode]);

  const getSeasonalBackgroundStyle = () => {
    const backgrounds = {
      kawaii: null,
      halloween: "url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68dd79726fce6eca73056b9b/ba3d7eb0b_c9c617da-1d0c-4fed-9830-7f692c5bac3d.png')",
      fall: "url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68dd79726fce6eca73056b9b/01f77998a_ChatGPTImageOct15202504_16_28PM.png')",
      winter: "url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68dd79726fce6eca73056b9b/d7ecb6583_ChatGPTImageOct15202504_16_31PM.png')",
      christmas: "url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68dd79726fce6eca73056b9b/8e296b8ab_1ChatGPTImageOct15202504_16_05PM.png')",
      valentines: "url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68dd79726fce6eca73056b9b/c990d460e_2ChatGPTImageOct15202504_16_09PM.png')",
      newyears: "url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68dd79726fce6eca73056b9b/829d2e43c_3ChatGPTImageOct15202504_11_12PM.png')",
      stpatricks: "url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68dd79726fce6eca73056b9b/4e394e799_4ChatGPTImageOct15202504_14_19PM.png')",
      fourthjuly: "url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68dd79726fce6eca73056b9b/b2551ae2b_5ChatGPTImageOct15202504_16_16PM.png')",
      summer: "url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68dd79726fce6eca73056b9b/3db9fd982_ChatGPTImageOct15202504_16_19PM.png')",
      spring: "url('https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68dd79726fce6eca73056b9b/7005cb267_ChatGPTImageOct15202504_16_23PM.png')",
    };

    if (specialMode === 'kawaii') {
      return {
        backgroundColor: '#FFB6D9',
      };
    }

    if (backgrounds[specialMode]) {
      return {
        backgroundImage: backgrounds[specialMode],
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      };
    }
    return {};
  };

  const handleNavClick = () => {
    setOpenMobile(false);
  };

  const navigationItems = [
    {
      title: "Home",
      url: createPageUrl("Home"),
      icon: LayoutDashboard,
    },
    {
      title: "Tasks",
      url: createPageUrl("Tasks"),
      icon: ListTodo,
    },
    {
      title: "Focus Timer",
      url: createPageUrl("FocusTimer"),
      icon: Timer,
    },
    {
      title: "Progress",
      url: createPageUrl("Progress"),
      icon: TrendingUp,
    },
    {
      title: "Support Space",
      url: createPageUrl("SupportSpace"),
      icon: MessageCircleHeart,
    },
    {
      title: "Parking Lot",
      url: createPageUrl("ParkingLot"),
      icon: Lightbulb,
    },
    {
      title: "Community",
      icon: Share2,
      isCollapsible: true,
      subItems: [
        {
          title: "Accountability",
          url: createPageUrl("Accountability"),
          icon: Share2,
          badge: accountabilityNotifications > 0 ? accountabilityNotifications : null,
        },
        {
          title: "Chat",
          url: createPageUrl("Chat"),
          icon: MessageCircle,
        },
        {
          title: "Focus Rooms",
          url: createPageUrl("FocusRooms"),
          icon: Users,
        },
        {
          title: "Leaderboard",
          url: createPageUrl("Leaderboard"),
          icon: Trophy,
        },
      ]
    },
  ];

  return (
    <div
      className={`min-h-screen flex w-full overflow-x-hidden ${
        specialMode === 'normal' ? getBackgroundClass() : ''
      }`}
      style={{
        ...(isSeasonalTheme() ? getSeasonalBackgroundStyle() : {}),
        paddingTop: 'env(safe-area-inset-top)'
      }}
    >
      {user && <OneSignalInit user={user} />}
      {specialMode === 'kawaii' && <KawaiiMode />}
      {specialMode === 'halloween' && <HalloweenMode />}
      {specialMode === 'fall' && <FallMode />}
      {specialMode === 'winter' && <WinterMode />}
      {specialMode === 'christmas' && <ChristmasMode />}
      {specialMode === 'valentines' && <ValentinesMode />}
      {specialMode === 'newyears' && <NewYearsMode />}
      {specialMode === 'stpatricks' && <StPatricksMode />}
      {specialMode === 'fourthjuly' && <FourthJulyMode />}
      {specialMode === 'summer' && <SummerMode />}
      {specialMode === 'spring' && <SpringMode />}
      <EasterEggVideo />

      {isSeasonalTheme() && !['summer', 'spring', 'valentines', 'stpatricks', 'kawaii', 'halloween', 'fall', 'winter'].includes(specialMode) && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}

      {['summer', 'spring', 'valentines', 'stpatricks', 'fall'].includes(specialMode) && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.4)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}

      {specialMode === 'winter' && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(173, 216, 230, 0.3)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}

      <style>{`
          ${!isSeasonalTheme() && theme === 'minimalist' ? `
            :root {
              --primary: 142 76% 36%;
              --primary-foreground: 0 0% 100%;
              --secondary: 40 20% 96%;
              --accent: 142 30% 85%;
              --muted: 40 10% 95%;
              --card: 0 0% 100%;
              --background: 0 0% 100%;
              --foreground: 0 0% 9%;
              --border: 0 0% 91%;
              --input: 0 0% 9%;
              --ring: 142 76% 36%;
            }
            .sage-50 { background-color: #f0f4f1; }
          ` : !isSeasonalTheme() && theme === 'dark' ? `
            :root {
              --primary: 142 76% 45%;
              --primary-foreground: 0 0% 100%;
              --secondary: 240 4% 12%;
              --accent: 240 4% 20%;
              --muted: 240 4% 15%;
              --card: 17 20% 12%;
              --card-foreground: 0 0% 98%;
              --popover: 17 20% 12%;
              --popover-foreground: 0 0% 98%;
              --background: 17 20% 8%;
              --foreground: 0 0% 98%;
              --border: 240 4% 18%;
              --input: 17 20% 12%;
              --ring: 142 76% 45%;
            }
          ` : !isSeasonalTheme() && theme === 'spicybrains' ? `
            :root {
              --primary: 330 100% 50%;
              --primary-foreground: 0 0% 100%;
              --secondary: 280 100% 70%;
              --accent: 180 100% 50%;
              --muted: 60 100% 75%;
              --card: 0 0% 100%;
              --card-foreground: 0 0% 9%;
              --background: 330 100% 98%;
              --foreground: 0 0% 9%;
              --border: 330 100% 80%;
              --input: 0 0% 9%;
              --ring: 330 100% 50%;
            }

            .spicybrains-card {
              background: linear-gradient(135deg, #ff6b9d 0%, #c06bff 50%, #6bc5ff 100%) !important;
              border: 3px solid #ffff00 !important;
              box-shadow: 0 8px 32px rgba(255, 0, 255, 0.3) !important;
            }

            .spicybrains-text {
              color: #000000 !important;
              text-shadow: 2px 2px 0px #ffff00, -2px -2px 0px #ff00ff;
            }

            .spicybrains-button {
              background: linear-gradient(45deg, #ff0080, #ff8c00, #40e0d0) !important;
              border: 2px solid #ffff00 !important;
              box-shadow: 0 4px 15px rgba(255, 0, 128, 0.4) !important;
              font-weight: bold !important;
              text-transform: uppercase !important;
              letter-spacing: 1px !important;
            }

            .spicybrains-input {
              border: 3px solid #ff00ff !important;
              background: linear-gradient(to right, #fff9c4, #ffecb3) !important;
            }
          ` : !isSeasonalTheme() ? `
            :root {
              --primary: 271 91% 65%;
              --primary-foreground: 0 0% 100%;
              --secondary: 33 100% 95%;
              --accent: 173 80% 70%;
              --muted: 271 20% 95%;
              --card: 0 0% 100%;
              --background: 0 0% 100%;
              --foreground: 0 0% 9%;
              --border: 0 0% 91%;
              --input: 0 0% 9%;
              --ring: 271 91% 65%;
            }
          ` : ''}

          html, body {
            overflow-x: hidden;
            width: 100%;
            max-width: 100vw;
          }

          * {
            box-sizing: border-box;
          }

          .christmas-card,
          .kawaii-card,
          .halloween-card,
          .fall-card,
          .winter-card,
          .valentines-card,
          .newyears-card,
          .stpatricks-card,
          .fourthjuly-card,
          .summer-card,
          .spring-card {
            background: rgba(255, 255, 255, 0.7) !important;
            backdrop-filter: blur(12px) !important;
            -webkit-backdrop-filter: blur(12px) !important;
            border: 1px solid rgba(255, 255, 255, 0.3) !important;
          }
        `}</style>

      <TooltipProvider>
          <Sidebar className={`border-r relative z-10 ${
            isSeasonalTheme()
              ? 'bg-white/70 backdrop-blur-md border-white/30'
              : theme === 'dark'
                ? 'bg-gray-950 border-gray-800'
                : theme === 'spicybrains'
                  ? 'bg-gradient-to-br from-pink-300 via-purple-300 to-cyan-300 border-yellow-400'
                  : 'border-gray-200/50 backdrop-blur-sm bg-white/80'
          }`}>
            <SidebarHeader className={`${
              isSeasonalTheme()
                ? 'border-0'
                : theme === 'dark'
                  ? 'bg-gray-900 border-0'
                  : theme === 'spicybrains'
                    ? 'bg-gradient-to-r from-pink-400 to-purple-400 border-0'
                    : 'border-0'
            }`} style={{
              paddingTop: 'max(2rem, calc(2rem + env(safe-area-inset-top)))',
              paddingLeft: '1.5rem',
              paddingRight: '1.5rem',
              paddingBottom: '1.5rem'
            }}>
              <div className="flex items-center gap-3">
                {user && user.profile_picture_url ? (
                    <Link to={createPageUrl("Profile")} onClick={handleNavClick}>
                        <img
                            src={user.profile_picture_url}
                            alt="Profile"
                            className="w-10 h-10 rounded-full object-cover"
                        />
                    </Link>
                ) : (
                    <Link to={createPageUrl("Profile")} onClick={handleNavClick}>
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-white text-xl ${
                            theme === 'minimalist'
                                ? 'bg-gradient-to-br from-green-600 to-green-700'
                                : theme === 'dark'
                                    ? 'bg-gradient-to-br from-green-500 to-emerald-600'
                                    : theme === 'spicybrains'
                                      ? 'bg-gradient-to-br from-pink-500 to-yellow-500 border-2 border-cyan-400'
                                      : 'bg-gradient-to-br from-green-500 to-emerald-600'
                        }`}>
                            {user?.full_name?.charAt(0)?.toUpperCase() || 'A'}
                        </div>
                    </Link>
                )}
                <Link to={createPageUrl("Home")} onClick={handleNavClick}>
                  <div>
                    <h2 className={`font-bold text-lg ${
                      theme === 'dark' ? 'text-white' : theme === 'spicybrains' ? 'text-gray-900' : 'text-gray-900'
                    }`}>{user?.full_name || 'ADHDone'}</h2>
                    <p className={`text-xs ${
                      theme === 'dark' ? 'text-gray-400' : theme === 'spicybrains' ? 'text-gray-800 font-medium' : 'text-gray-500'
                    }`}>You've got this</p>
                  </div>
                </Link>
              </div>
            </SidebarHeader>

            <SidebarContent className={`${
              theme === 'dark' ? 'bg-gray-950' : theme === 'spicybrains' ? 'bg-gradient-to-br from-pink-200 via-purple-200 to-cyan-200' : ''
            }`} style={{
              paddingTop: '2.5rem',
              paddingBottom: '2.5rem',
              paddingLeft: '0.75rem',
              paddingRight: '0.75rem'
            }}>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu className="space-y-1">
                    {navigationItems.map((item) => {
                      if (item.isCollapsible) {
                        const isOpen = communityOpen;
                        const onOpenChange = setCommunityOpen;

                        return (
                          <Collapsible
                            key={item.title}
                            open={isOpen}
                            onOpenChange={onOpenChange}
                          >
                            <SidebarMenuItem>
                              <CollapsibleTrigger asChild>
                                <SidebarMenuButton
                                  className={`rounded-xl transition-all duration-200 ${
                                    isSeasonalTheme()
                                      ? 'hover:bg-white/50 text-gray-800'
                                      : theme === 'dark'
                                        ? 'hover:bg-gray-800 text-gray-300 hover:text-white'
                                        : theme === 'spicybrains'
                                          ? 'hover:bg-gradient-to-r hover:from-yellow-300 hover:to-pink-300 text-gray-900 font-medium'
                                          : 'hover:bg-gray-50 text-gray-700'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 py-3 w-full">
                                    <item.icon className="w-5 h-5" />
                                    <span className="flex-1">{item.title}</span>
                                    {isOpen ? (
                                      <ChevronDown className="w-4 h-4" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4" />
                                    )}
                                  </div>
                                </SidebarMenuButton>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="space-y-1 mt-1 ml-9">
                                {item.subItems.map((subItem) => (
                                  <SidebarMenuButton
                                    key={subItem.title}
                                    asChild
                                    className={`rounded-xl transition-all duration-200 ${
                                      location.pathname === subItem.url
                                        ? isSeasonalTheme()
                                          ? 'bg-white/70 text-gray-900 font-medium'
                                          : theme === 'minimalist'
                                            ? 'bg-green-50 text-green-700 font-medium'
                                            : theme === 'dark'
                                              ? 'bg-gray-800 text-white font-medium'
                                              : theme === 'spicybrains'
                                                ? 'bg-gradient-to-r from-pink-400 to-yellow-300 text-gray-900 font-bold border-2 border-cyan-400'
                                                : 'bg-gradient-to-r from-purple-100 to-orange-100 text-purple-700 font-medium'
                                        : isSeasonalTheme()
                                          ? 'hover:bg-white/40 text-gray-700'
                                          : theme === 'dark'
                                            ? 'hover:bg-gray-800 text-gray-400 hover:text-white'
                                            : theme === 'spicybrains'
                                              ? 'hover:bg-gradient-to-r hover:from-yellow-200 hover:to-pink-200 text-gray-800'
                                              : 'hover:bg-gray-50 text-gray-600'
                                    }`}
                                  >
                                    <Link to={subItem.url} onClick={handleNavClick} className="flex items-center gap-3 px-4 py-2 relative">
                                      <subItem.icon className="w-4 h-4" />
                                      <span className="text-sm flex-1">{subItem.title}</span>
                                      {subItem.badge && subItem.badge > 0 && (
                                        <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                                          {subItem.badge}
                                        </span>
                                      )}
                                    </Link>
                                  </SidebarMenuButton>
                                ))}
                              </CollapsibleContent>
                            </SidebarMenuItem>
                          </Collapsible>
                        );
                      }

                      return (
                        <SidebarMenuItem key={item.title}>
                          <Link to={item.url} onClick={handleNavClick}>
                            <SidebarMenuButton
                              className={`rounded-xl transition-all duration-200 ${
                                location.pathname === item.url
                                  ? isSeasonalTheme()
                                    ? 'bg-white/70 text-gray-900 font-medium'
                                    : theme === 'minimalist'
                                      ? 'bg-green-50 text-green-700 font-medium'
                                      : theme === 'dark'
                                        ? 'bg-gray-800 text-white font-medium'
                                      : theme === 'spicybrains'
                                          ? 'bg-gradient-to-r from-pink-400 to-yellow-300 text-gray-900 font-bold border-2 border-cyan-400'
                                        : 'bg-gradient-to-r from-purple-100 to-orange-100 text-purple-700 font-medium'
                                  : isSeasonalTheme()
                                    ? 'hover:bg-white/40 text-gray-700'
                                    : theme === 'dark'
                                      ? 'hover:bg-gray-800 text-gray-400 hover:text-white'
                                      : theme === 'spicybrains'
                                        ? 'hover:bg-gradient-to-r hover:from-yellow-300 hover:to-pink-300 text-gray-900 font-medium'
                                        : 'hover:bg-gray-50 text-gray-700'
                              }`}
                            >
                              <div className="flex items-center gap-3 py-3 w-full">
                                <item.icon className="w-5 h-5" />
                                <span>{item.title}</span>
                              </div>
                            </SidebarMenuButton>
                          </Link>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className={`space-y-3 ${
              isSeasonalTheme()
                ? ''
                : theme === 'dark'
                  ? 'bg-gray-950'
                  : theme === 'spicybrains'
                    ? 'bg-gradient-to-br from-pink-300 via-purple-300 to-cyan-300'
                    : ''
            }`} style={{
              paddingTop: '1rem',
              paddingLeft: '1rem',
              paddingRight: '1rem',
              paddingBottom: 'max(3rem, calc(3rem + env(safe-area-inset-bottom)))'
            }}>
              <Button
                variant="outline"
                onClick={() => setShowAppGuide(true)}
                className={`w-full flex items-center justify-center gap-2 rounded-xl ${
                  isSeasonalTheme()
                    ? 'bg-white/60 hover:bg-white/80 text-gray-800 border-white/40'
                    : theme === 'dark'
                      ? 'border-gray-700 hover:bg-gray-800 text-gray-300 bg-transparent'
                      : theme === 'spicybrains'
                        ? 'bg-gradient-to-r from-yellow-300 to-pink-300 hover:from-yellow-400 hover:to-pink-400 text-gray-900 font-bold border-2 border-cyan-400'
                        : ''
                }`}
              >
                <HelpCircle className="w-4 h-4" />
                <span>App Guide</span>
              </Button>

              <Button
                variant="outline"
                onClick={toggleTheme}
                className={`w-full flex items-center justify-center gap-2 rounded-xl ${
                  isSeasonalTheme()
                    ? 'bg-white/60 hover:bg-white/80 text-gray-800 border-white/40'
                    : theme === 'dark'
                      ? 'border-gray-700 hover:bg-gray-800 text-gray-300 bg-transparent'
                      : theme === 'spicybrains'
                        ? 'bg-gradient-to-r from-yellow-300 to-pink-300 hover:from-yellow-400 hover:to-pink-400 text-gray-900 font-bold border-2 border-cyan-400'
                        : ''
                }`}
              >
                {theme === 'minimalist' ? (
                  <>
                    <Sun className="w-4 h-4" />
                    <span>Light Theme</span>
                  </>
                ) : theme === 'dark' ? (
                  <>
                    <Moon className="w-4 h-4" />
                    <span>Dark Theme</span>
                  </>
                ) : theme === 'spicybrains' ? (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Spicy Brains Theme</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Colorful Theme</span>
                  </>
                )}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className={`w-full flex items-center justify-center gap-2 rounded-xl ${
                      isSeasonalTheme()
                        ? 'bg-white/60 hover:bg-white/80 text-gray-800 border-white/40'
                        : theme === 'dark'
                          ? 'border-gray-700 hover:bg-gray-800 text-gray-300 bg-transparent'
                          : theme === 'spicybrains'
                            ? 'bg-gradient-to-r from-yellow-300 to-pink-300 hover:from-yellow-400 hover:to-pink-400 text-gray-900 font-bold border-2 border-cyan-400'
                            : ''
                    }`}
                  >
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className={`w-56 ${
                  isSeasonalTheme()
                    ? 'bg-white/95 backdrop-blur-md border-white/40 text-gray-800'
                    : theme === 'dark'
                      ? 'bg-[#1a1a1b] border-gray-800 text-gray-300'
                      : theme === 'spicybrains'
                        ? 'bg-gradient-to-br from-pink-200 to-yellow-200 border-2 border-cyan-400 text-gray-900'
                        : ''
                }`}>
                  <DropdownMenuItem onClick={() => { navigate(createPageUrl("Profile")); handleNavClick(); }}>
                    <UserIcon className="w-4 h-4 mr-2" />
                    My Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { navigate(createPageUrl("MyAccount")); handleNavClick(); }}>
                    <UserIcon className="w-4 h-4 mr-2" />
                    My Account
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { navigate(createPageUrl("NotificationSettings")); handleNavClick(); }}>
                    <Bell className="w-4 h-4 mr-2" />
                    Notifications
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => { navigate(createPageUrl("PrivacyPolicy")); handleNavClick(); }}>
                    <Shield className="w-4 h-4 mr-2" />
                    Privacy Policy
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { navigate(createPageUrl("TermsAndConditions")); handleNavClick(); }}>
                    <Shield className="w-4 h-4 mr-2" />
                    Terms & Conditions
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { navigate(createPageUrl("ReportBug")); handleNavClick(); }}>
                    <Bug className="w-4 h-4 mr-2" />
                    Feedback
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                    <LogOut className="w-4 h-4 mr-2" />
                    Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarFooter>
          </Sidebar>

          <main className="flex-1 flex flex-col min-w-0 min-h-screen relative z-10">
            <header className={`backdrop-blur-md border-b px-6 md:hidden sticky top-0 z-10 ${
              isSeasonalTheme()
                ? 'bg-white/60 border-white/30'
                : theme === 'dark'
                  ? 'bg-gray-950/80 border-gray-800'
                  : theme === 'spicybrains'
                    ? 'bg-gradient-to-r from-pink-400/80 to-cyan-400/80 border-yellow-400'
                    : 'bg-white/60 border-gray-200/50'
            }`} style={{
              paddingTop: 'calc(2rem + env(safe-area-inset-top, 0px))',
              paddingBottom: '1rem'
            }}>
              <div className="flex items-center gap-4">
                <SidebarTrigger asChild>
                  <Button variant="ghost" className={`p-2 rounded-xl transition-colors duration-200 ${
                    isSeasonalTheme()
                      ? 'hover:bg-white/50 text-gray-800'
                      : theme === 'dark'
                        ? 'hover:bg-gray-800 text-white'
                        : theme === 'spicybrains'
                          ? 'hover:bg-yellow-300 text-gray-900'
                          : 'hover:bg-gray-100'
                  }`}>
                    <LayoutDashboard className="w-5 h-5" />
                  </Button>
                </SidebarTrigger>
                <h1 className={`text-xl font-bold ${
                  isSeasonalTheme()
                    ? 'text-gray-900'
                    : theme === 'dark'
                      ? 'text-white'
                      : theme === 'spicybrains'
                        ? 'text-gray-900'
                        : 'text-gray-900'
                }`}>ADHDone</h1>
              </div>
            </header>

            <div className="flex-1 overflow-auto">
              {children}
            </div>

            {currentPageName !== "Home" && currentPageName !== "ParkingLot" && currentPageName !== "SupportSpace" && (
              <Button
                onClick={() => {
                  const event = new CustomEvent('open-voice-assistant');
                  window.dispatchEvent(event);
                }}
                size="lg"
                className={`fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl z-50 md:hidden bg-opacity-90 ${
                  theme === 'minimalist'
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : theme === 'dark'
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : theme === 'spicybrains'
                        ? 'bg-gradient-to-r from-pink-500 to-yellow-500 hover:from-pink-600 hover:to-yellow-600 border-2 border-cyan-400'
                        : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'
                }`}
                style={{
                  marginBottom: 'max(1.5rem, calc(1.5rem + env(safe-area-inset-bottom)))'
                }}
              >
                <Mic className="w-6 h-6" />
              </Button>
            )}
          </main>

          <EnergyCheckInModal
            isOpen={showEnergyCheckIn}
            onClose={() => setShowEnergyCheckIn(false)}
            theme={theme}
          />
          <TrialWarningModal
            isOpen={showTrialWarning}
            onClose={() => setShowTrialWarning(false)}
            theme={theme}
          />
          <UniversalVoiceAssistant theme={theme} currentPageName={currentPageName} />
          <MicrophonePermissionCheck theme={theme} />
          <PokeNotification theme={theme} />

        <AppGuideModal
          isOpen={showAppGuide}
          onClose={() => setShowAppGuide(false)}
          theme={theme}
        />

        <Dialog open={showSpicyBrainsExplanation} onOpenChange={setShowSpicyBrainsExplanation}>
          <DialogContent className="max-w-2xl bg-gradient-to-br from-pink-100 via-purple-100 to-cyan-100 border-4 border-yellow-400">
            <DialogHeader>
              <DialogTitle className="text-3xl font-bold text-center bg-gradient-to-r from-pink-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent">
                🧠 Colors for Spicy Brains! 🌈
              </DialogTitle>
              <DialogDescription className="text-center text-gray-700 font-medium">
                Welcome to the most neuroscience-backed colorful theme ever!
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto p-4">
              <div className="p-4 rounded-lg bg-red-100 border-2 border-red-400">
                <h3 className="font-bold text-red-900 text-lg mb-2">🔴 Red – Attention and urgency</h3>
                <p className="text-red-800 text-sm">
                  Activates the amygdala and increases heart rate and alertness. Triggers a mild stress response, which can boost focus in short bursts. Useful for deadlines or high-priority tasks, but overstimulating if overused.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-yellow-100 border-2 border-yellow-400">
                <h3 className="font-bold text-yellow-900 text-lg mb-2">🟡 Yellow – Optimism and memory</h3>
                <p className="text-yellow-800 text-sm">
                  Stimulates the release of serotonin and dopamine. Activates the left hemisphere, which supports logic and memory recall. Helpful for highlighting key ideas or labeling motivational categories (e.g., "goals," "wins," "ideas").
                </p>
              </div>

              <div className="p-4 rounded-lg bg-blue-100 border-2 border-blue-400">
                <h3 className="font-bold text-blue-900 text-lg mb-2">🔵 Blue – Calm and cognitive control</h3>
                <p className="text-blue-800 text-sm">
                  Associated with reduced cortisol levels and lower blood pressure. Activates the parasympathetic nervous system, improving concentration and decision-making. Ideal for scheduling, planning, and calming overstimulation.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-green-100 border-2 border-green-400">
                <h3 className="font-bold text-green-900 text-lg mb-2">🟢 Green – Balance and comprehension</h3>
                <p className="text-green-800 text-sm">
                  Associated with the ventromedial prefrontal cortex, which processes safety and reward. Supports sustained attention and comfort — good for long-term projects or reference materials.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-orange-100 border-2 border-orange-400">
                <h3 className="font-bold text-orange-900 text-lg mb-2">🟠 Orange – Energy and stimulation</h3>
                <p className="text-orange-800 text-sm">
                  Combines red's intensity with yellow's positivity. Increases mental energy and social motivation — effective for tasks that need creativity or teamwork.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-purple-100 border-2 border-purple-400">
                <h3 className="font-bold text-purple-900 text-lg mb-2">🟣 Purple – Creativity and abstraction</h3>
                <p className="text-purple-800 text-sm">
                  Stimulates areas involved in imagination (default mode network). Good for brainstorming or categorizing ideas requiring flexible thinking.
                </p>
              </div>
            </div>
            <div className="flex justify-center pt-4">
              <Button 
                onClick={() => setShowSpicyBrainsExplanation(false)}
                className="bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 hover:from-pink-600 hover:via-purple-600 hover:to-cyan-600 text-white font-bold text-lg px-8 border-2 border-yellow-400"
              >
                Let's Go! 🚀
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </TooltipProvider>
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState(null);
  const [authCheckComplete, setAuthCheckComplete] = useState(false);

  // List of public pages that don't require authentication
  const publicPages = ['DeleteAccount', 'DeleteData', 'PrivacyPolicy', 'TermsAndConditions'];
  const isPublicPage = publicPages.includes(currentPageName);

  const checkUserStatusAndTrial = useCallback(async () => {
    // Skip auth check for public pages
    if (isPublicPage) {
      setAuthCheckComplete(true);
      return;
    }

    try {
      const currentUser = await base44.auth.me();

      if (!currentUser.trial_start_date) {
        const today = new Date().toISOString().split('T')[0];
        try {
          await base44.auth.updateMe({ trial_start_date: today });
          const updatedUser = await base44.auth.me();
          setUser(updatedUser);
        } catch (updateError) {
          console.error("Error updating trial start date:", updateError);
          setUser(currentUser);
        }
      } else {
        setUser(currentUser);
      }

      // IMPROVED: Trial logic with manual trial_end_date override
      // Priority 1: Check if user has lifetime access
      if (currentUser.is_lifetime_access) {
        setAuthCheckComplete(true);
        return;
      }

      // Priority 2: Check if user has paid subscription
      if (currentUser.has_paid) {
        setAuthCheckComplete(true);
        return;
      }

      // Priority 3: Check manual trial_end_date (for testers)
      if (currentUser.trial_end_date) {
        const trialEnd = new Date(currentUser.trial_end_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (today > trialEnd && location.pathname !== createPageUrl("TrialEnded")) {
          navigate(createPageUrl("TrialEnded"));
          return;
        }
      } 
      // Priority 4: Default 7-day trial from trial_start_date
      else if (currentUser.trial_start_date) {
        const trialStart = new Date(currentUser.trial_start_date);
        const today = new Date();
        const daysDiff = Math.floor((today - trialStart) / (1000 * 60 * 60 * 24));

        if (daysDiff >= 7 && location.pathname !== createPageUrl("TrialEnded")) {
          navigate(createPageUrl("TrialEnded"));
          return;
        }
      }

      setAuthCheckComplete(true);
    } catch (error) {
      console.error("Error checking user status:", error);
      // User not authenticated - redirect to login
      base44.auth.redirectToLogin(window.location.href);
    }
  }, [location.pathname, navigate, isPublicPage]);

  useEffect(() => {
    checkUserStatusAndTrial();
  }, [checkUserStatusAndTrial]);

  if (!authCheckComplete) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-green-500 rounded-full animate-spin"></div>
          <p className="text-lg font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // Render public pages without sidebar
  if (isPublicPage) {
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <SidebarProvider>
      <LayoutContent children={children} currentPageName={currentPageName} user={user} authCheckComplete={authCheckComplete} />
    </SidebarProvider>
  );
}
