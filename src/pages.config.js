import Accountability from './pages/Accountability';
import AddTask from './pages/AddTask';
import AuthCallback from './pages/AuthCallback';
import Chat from './pages/Chat';
import CronSetup from './pages/CronSetup';
import DeleteAccount from './pages/DeleteAccount';
import DeleteData from './pages/DeleteData';
import FocusRooms from './pages/FocusRooms';
import FocusTimer from './pages/FocusTimer';
import Home from './pages/Home';
import IAPSetupGuide from './pages/IAPSetupGuide';
import Insights from './pages/Insights';
import InstallInstructions from './pages/InstallInstructions';
import Leaderboard from './pages/Leaderboard';
import MyAccount from './pages/MyAccount';
import NotificationSettings from './pages/NotificationSettings';
import ParkingLot from './pages/ParkingLot';
import PaymentSuccess from './pages/PaymentSuccess';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Profile from './pages/Profile';
import ProfileSettings from './pages/ProfileSettings';
import Progress from './pages/Progress';
import ReportBug from './pages/ReportBug';
import SpotifyCallback from './pages/SpotifyCallback';
import Subscribe from './pages/Subscribe';
import SupportSpace from './pages/SupportSpace';
import TaskNotification from './pages/TaskNotification';
import Tasks from './pages/Tasks';
import TermsAndConditions from './pages/TermsAndConditions';
import TrialEnded from './pages/TrialEnded';
import UserProfile from './pages/UserProfile';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Accountability": Accountability,
    "AddTask": AddTask,
    "AuthCallback": AuthCallback,
    "Chat": Chat,
    "CronSetup": CronSetup,
    "DeleteAccount": DeleteAccount,
    "DeleteData": DeleteData,
    "FocusRooms": FocusRooms,
    "FocusTimer": FocusTimer,
    "Home": Home,
    "IAPSetupGuide": IAPSetupGuide,
    "Insights": Insights,
    "InstallInstructions": InstallInstructions,
    "Leaderboard": Leaderboard,
    "MyAccount": MyAccount,
    "NotificationSettings": NotificationSettings,
    "ParkingLot": ParkingLot,
    "PaymentSuccess": PaymentSuccess,
    "PrivacyPolicy": PrivacyPolicy,
    "Profile": Profile,
    "ProfileSettings": ProfileSettings,
    "Progress": Progress,
    "ReportBug": ReportBug,
    "SpotifyCallback": SpotifyCallback,
    "Subscribe": Subscribe,
    "SupportSpace": SupportSpace,
    "TaskNotification": TaskNotification,
    "Tasks": Tasks,
    "TermsAndConditions": TermsAndConditions,
    "TrialEnded": TrialEnded,
    "UserProfile": UserProfile,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};