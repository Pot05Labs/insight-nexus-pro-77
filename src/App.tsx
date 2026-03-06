import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { GlobalFilterProvider } from "@/contexts/GlobalFilterContext";
import { OrgProvider } from "@/contexts/OrgContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Skeleton } from "@/components/ui/skeleton";

// ── Eagerly-loaded pages (needed at first paint) ──
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import NotFound from "./pages/NotFound";
import DashboardLayout from "./components/DashboardLayout";
import SubscriptionPaywall from "./components/SubscriptionPaywall";
import CookieConsent from "./components/CookieConsent";

// ── Lazy-loaded pages (loaded on demand) ──
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const DashboardHome = lazy(() => import("./pages/DashboardHome"));
const UploadPage = lazy(() => import("./pages/UploadPage"));
const PreviewPage = lazy(() => import("./pages/PreviewPage"));
const ProductsPage = lazy(() => import("./pages/ProductsPage"));
const RetailersPage = lazy(() => import("./pages/RetailersPage"));
const GeographyPage = lazy(() => import("./pages/GeographyPage"));
const BehaviourPage = lazy(() => import("./pages/BehaviourPage"));
const CampaignsPage = lazy(() => import("./pages/CampaignsPage"));
const InsightsPage = lazy(() => import("./pages/InsightsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));

/** Fallback shown while a lazy chunk loads */
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <Skeleton className="h-64 w-full max-w-4xl rounded-xl" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,        // 30 seconds — keep data fresh after uploads
      gcTime: 10 * 60 * 1000,      // 10 minutes — keep cache warm
      retry: 1,                     // single retry (default 3 is too aggressive)
      refetchOnWindowFocus: true,   // refetch when user returns to tab
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <OrgProvider>
      <NotificationsProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <CookieConsent />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />

            {/* Protected routes — wrapped in GlobalFilterProvider for cross-page filters */}
            <Route element={<ProtectedRoute><GlobalFilterProvider><DashboardLayout /></GlobalFilterProvider></ProtectedRoute>}>
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
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
      </NotificationsProvider>
      </OrgProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
