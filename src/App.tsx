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
import QueryPage from "./pages/QueryPage";
import SettingsPage from "./pages/SettingsPage";
import PricingPage from "./pages/PricingPage";
import SubscriptionPaywall from "./components/SubscriptionPaywall";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <NotificationsProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

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
              <Route path="/query" element={<SubscriptionPaywall><QueryPage /></SubscriptionPaywall>} />
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
