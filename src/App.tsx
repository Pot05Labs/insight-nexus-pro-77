import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import DashboardLayout from "./components/DashboardLayout";
import DashboardHome from "./pages/DashboardHome";
import UploadPage from "./pages/UploadPage";
import PreviewPage from "./pages/PreviewPage";
import ProductsPage from "./pages/ProductsPage";
import RetailersPage from "./pages/RetailersPage";
import GeographyPage from "./pages/GeographyPage";
import BehaviourPage from "./pages/BehaviourPage";
import CampaignsPage from "./pages/CampaignsPage";
import InsightsPage from "./pages/InsightsPage";
import SettingsPage from "./pages/SettingsPage";
import PricingPage from "./pages/PricingPage";
import SubscriptionPaywall from "./components/SubscriptionPaywall";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import CookieConsent from "./components/CookieConsent";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,   // 5 minutes — avoid unnecessary refetches during demos
      gcTime: 10 * 60 * 1000,      // 10 minutes — keep cache warm
      retry: 1,                     // single retry (default 3 is too aggressive)
      refetchOnWindowFocus: false,  // prevent subscription check flash on tab switch
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <NotificationsProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <CookieConsent />
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/preview" element={<PreviewPage />} />
              <Route path="/dashboard" element={<SubscriptionPaywall><DashboardHome /></SubscriptionPaywall>} />
              <Route path="/products" element={<SubscriptionPaywall><ProductsPage /></SubscriptionPaywall>} />
              <Route path="/retailers" element={<SubscriptionPaywall><RetailersPage /></SubscriptionPaywall>} />
              <Route path="/geography" element={<SubscriptionPaywall><GeographyPage /></SubscriptionPaywall>} />
              <Route path="/behaviour" element={<SubscriptionPaywall><BehaviourPage /></SubscriptionPaywall>} />
              <Route path="/campaigns" element={<SubscriptionPaywall><CampaignsPage /></SubscriptionPaywall>} />
              <Route path="/insights" element={<SubscriptionPaywall><InsightsPage /></SubscriptionPaywall>} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/billing" element={<PricingPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </NotificationsProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
