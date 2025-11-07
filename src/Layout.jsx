
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
  Info,
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
      const now = new Date().getTime();
      const fourHours = 4 * 60 * 60 * 1000;

      if (lastCheckIn && now - parseInt(lastCheckIn) < fourHours) {
        return;
      }

      setTimeout(() => {
        setShowEnergyCheckIn(true);
        localStorage.setItem('last_energy_checkin_time', now.toString());
        localStorage.setItem('energy_checkin_count', (checkInCount + 1).toString());
      }, 5 * 60 * 1000);
    };

    checkEnergyCheckIn();
  }, []);

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
      if (prev === 'minimalist') return 'dark';
      if (prev === 'dark') return 'colorful';
      return 'minimalist';
    });
  };

  const getCurrentSeasonalTheme = () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    
    if (month === 1 && day <= 2) return 'newyears';
    if ((month === 1 && day >= 3) || (month === 2 && day <= 7)) return 'winter';
    if (month === 2 && day >= 8 && day <= 14) return 'valentines';
    if ((month === 2 && day >= 15) || (month === 3 && day <= 16)) return 'winter';
    if (month === 3 && day === 17) return 'stpatricks';
    if ((month === 3 && day >= 18) || month === 4 || month === 5 || (month === 6 && day <= 21)) return 'spring';
    if ((month === 6 && day >= 22) || (month === 7 && day <= 3)) return 'summer';
    if (month === 7 && day === 4) return 'fourthjuly';
    if ((month === 7 && day >= 5) || (month === 8 && day <= 20)) return 'summer';
    if ((month === 8 && day >= 21) || month === 9 || month === 11) return 'fall';
    if (month === 10) return 'halloween';
    if (month === 12 && day <= 25) return 'christmas';
    if (month === 12 && day >= 26 && day <= 30) return 'winter';
    if (month === 12 && day === 31) return 'newyears';
    
    return 'spring';
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
    // Close sidebar on mobile when navigation item is clicked
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
        paddingTop: 'env(safe-area-inset-top)', // Changed this line
        paddingBottom: 'max(5rem, calc(5rem + env(safe-area-inset-bottom)))'
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
                ? 'bg-gray-900 border-gray-800'
                : 'border-gray-200/50 backdrop-blur-sm bg-white/80'
          }`}>
            <SidebarHeader className={`p-6 ${
              isSeasonalTheme()
                ? 'border-white/30'
                : theme === 'dark'
                  ? 'border-gray-800 bg-gray-900'
                  : 'border-gray-200/50'
            }`}>
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
                                    : 'bg-gradient-to-br from-green-500 to-emerald-600'
                        }`}>
                            A
                        </div>
                    </Link>
                )}
                <Link to={createPageUrl("Home")} onClick={handleNavClick}>
                  <div>
                    <h2 className={`font-bold text-lg ${
                      theme === 'dark' ? 'text-white' : 'text-gray-900'
                    }`}>ADHDone</h2>
                    <p className={`text-xs ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}>You've got this</p>
                  </div>
                </Link>
              </div>
            </SidebarHeader>

            <SidebarContent className={`p-3 ${
              theme === 'dark' ? 'bg-gray-900' : ''
            }`}>
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
                                              : 'bg-gradient-to-r from-purple-100 to-orange-100 text-purple-700 font-medium'
                                        : isSeasonalTheme()
                                          ? 'hover:bg-white/40 text-gray-700'
                                          : theme === 'dark'
                                            ? 'hover:bg-gray-800 text-gray-400 hover:text-white'
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
                                      : 'bg-gradient-to-r from-purple-100 to-orange-100 text-purple-700 font-medium'
                                  : isSeasonalTheme()
                                    ? 'hover:bg-white/40 text-gray-700'
                                    : theme === 'dark'
                                      ? 'hover:bg-gray-800 text-gray-400 hover:text-white'
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

            <SidebarFooter className={`border-t space-y-3 ${
              isSeasonalTheme()
                ? 'border-white/30'
                : theme === 'dark'
                  ? 'border-gray-800 bg-gray-900'
                  : 'border-gray-200/50'
            }`} style={{
              padding: '0.5rem 1rem',
              paddingBottom: 'max(2rem, calc(2rem + env(safe-area-inset-bottom)))',
              marginTop: '0.3rem'
            }}>
              <Button
                variant="outline"
                onClick={() => setShowAppGuide(true)}
                className={`w-full flex items-center justify-center gap-2 rounded-xl ${
                  isSeasonalTheme()
                    ? 'bg-white/60 hover:bg-white/80 text-gray-800 border-white/40'
                    : theme === 'dark'
                      ? 'border-gray-700 hover:bg-gray-800 text-gray-300 bg-transparent'
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
                      : ''
                }`}
              >
                {theme === 'minimalist' ? (
                  <>
                    <Sun className="w-4 h-4" />
                    <span>Light Mode</span>
                  </>
                ) : theme === 'dark' ? (
                  <>
                    <Moon className="w-4 h-4" />
                    <span>Dark Mode</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Colorful Mode</span>
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
                    <Settings className="w-4 h-4 mr-2" />
                    Privacy Policy
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { navigate(createPageUrl("TermsAndConditions")); handleNavClick(); }}>
                    <Settings className="w-4 h-4 mr-2" />
                    Terms & Conditions
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { navigate(createPageUrl("ReportBug")); handleNavClick(); }}>
                    <Bug className="w-4 h-4 mr-2" />
                    Report a Bug
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

          <main className="flex-1 flex flex-col min-w-0 relative z-10" style={{
            paddingBottom: 'max(5rem, calc(5rem + env(safe-area-inset-bottom)))'
          }}>
            <header className={`backdrop-blur-md border-b px-6 md:hidden sticky top-0 z-10 ${
              isSeasonalTheme()
                ? 'bg-white/60 border-white/30'
                : theme === 'dark'
                  ? 'bg-gray-950/60 border-gray-800'
                  : 'bg-white/60 border-gray-200/50'
            }`} style={{
              paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))', // Changed this line
              paddingBottom: '1rem'
            }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <SidebarTrigger asChild>
                    <Button variant="ghost" className={`p-2 rounded-xl transition-colors duration-200 ${
                      isSeasonalTheme()
                        ? 'hover:bg-white/50 text-gray-800'
                        : theme === 'dark'
                          ? 'hover:bg-gray-800 text-white'
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
                        : 'text-gray-900'
                  }`}>ADHDone</h1>
                </div>
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
      </TooltipProvider>
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState(null);
  const [authCheckComplete, setAuthCheckComplete] = useState(false);

  const checkUserStatusAndTrial = useCallback(async () => {
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

      // Trial Warning/Ending logic
      if (currentUser.trial_start_date && !currentUser.has_paid) {
        const trialStart = new Date(currentUser.trial_start_date);
        const today = new Date();
        const daysDiff = Math.floor((today - trialStart) / (1000 * 60 * 60 * 24));

        if (daysDiff >= 3 && location.pathname !== createPageUrl("TrialEnded")) {
          navigate(createPageUrl("TrialEnded"));
        }
        // Removed `else if (daysDiff === 2) { setShowTrialWarning(true); }` as per outline,
        // assuming trial warning display is managed within LayoutContent if needed.
      }

      setAuthCheckComplete(true);
    } catch (error) {
      console.error("Error checking user status:", error);
      // User not authenticated - redirect to login
      base44.auth.redirectToLogin(window.location.href);
    }
  }, [location.pathname, navigate]);


  useEffect(() => {
    checkUserStatusAndTrial();
  }, [checkUserStatusAndTrial]);

  if (!authCheckComplete) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-green-500 rounded-full animate-spin"></div>
          <p className="text-lg font-medium">Loading ADHDone...</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <LayoutContent children={children} currentPageName={currentPageName} user={user} authCheckComplete={authCheckComplete} />
    </SidebarProvider>
  );
}
