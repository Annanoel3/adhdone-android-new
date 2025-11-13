import Home from './pages/Home';
import Tasks from './pages/Tasks';
import AddTask from './pages/AddTask';
import FocusTimer from './pages/FocusTimer';
import SupportSpace from './pages/SupportSpace';
import ParkingLot from './pages/ParkingLot';
import Insights from './pages/Insights';
import Accountability from './pages/Accountability';
import Subscribe from './pages/Subscribe';
import ReportBug from './pages/ReportBug';
import InstallInstructions from './pages/InstallInstructions';
import AuthCallback from './pages/AuthCallback';
import TrialEnded from './pages/TrialEnded';
import PaymentSuccess from './pages/PaymentSuccess';
import MyAccount from './pages/MyAccount';
import Leaderboard from './pages/Leaderboard';
import ProfileSettings from './pages/ProfileSettings';
import Chat from './pages/Chat';
import NotificationSettings from './pages/NotificationSettings';
import FocusRooms from './pages/FocusRooms';
import Progress from './pages/Progress';
import UserProfile from './pages/UserProfile';
import Profile from './pages/Profile';
import CronSetup from './pages/CronSetup';
import PrivacyPolicy from './pages/PrivacyPolicy';
import IAPSetupGuide from './pages/IAPSetupGuide';
import TermsAndConditions from './pages/TermsAndConditions';
import SpotifyCallback from './pages/SpotifyCallback';
import TaskNotification from './pages/TaskNotification';
import DeleteAccount from './pages/DeleteAccount';
import Layout from './Layout.jsx';


export const PAGES = {
    "Home": Home,
    "Tasks": Tasks,
    "AddTask": AddTask,
    "FocusTimer": FocusTimer,
    "SupportSpace": SupportSpace,
    "ParkingLot": ParkingLot,
    "Insights": Insights,
    "Accountability": Accountability,
    "Subscribe": Subscribe,
    "ReportBug": ReportBug,
    "InstallInstructions": InstallInstructions,
    "AuthCallback": AuthCallback,
    "TrialEnded": TrialEnded,
    "PaymentSuccess": PaymentSuccess,
    "MyAccount": MyAccount,
    "Leaderboard": Leaderboard,
    "ProfileSettings": ProfileSettings,
    "Chat": Chat,
    "NotificationSettings": NotificationSettings,
    "FocusRooms": FocusRooms,
    "Progress": Progress,
    "UserProfile": UserProfile,
    "Profile": Profile,
    "CronSetup": CronSetup,
    "PrivacyPolicy": PrivacyPolicy,
    "IAPSetupGuide": IAPSetupGuide,
    "TermsAndConditions": TermsAndConditions,
    "SpotifyCallback": SpotifyCallback,
    "TaskNotification": TaskNotification,
    "DeleteAccount": DeleteAccount,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: Layout,
};