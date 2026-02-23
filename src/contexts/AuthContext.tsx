import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { TierKey, getTierByProductId } from "@/lib/stripe-tiers";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  subscribed: boolean;
  subscriptionTier: TierKey | null;
  subscriptionEnd: string | null;
  checkingSubscription: boolean;
  refreshSubscription: () => Promise<void>;
  userRole: string | null;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
  subscribed: false,
  subscriptionTier: null,
  subscriptionEnd: null,
  checkingSubscription: true,
  refreshSubscription: async () => {},
  userRole: null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState<TierKey | null>(null);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  const checkSubscription = useCallback(async () => {
    setCheckingSubscription(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) {
        console.warn("Subscription check failed (edge function may not be deployed):", error.message);
        // Graceful fallback — don't block the app
        setSubscribed(false);
        setSubscriptionTier(null);
        setSubscriptionEnd(null);
        return;
      }
      setSubscribed(data?.subscribed ?? false);
      setSubscriptionTier(data?.product_id ? getTierByProductId(data.product_id) : null);
      setSubscriptionEnd(data?.subscription_end ?? null);
    } catch (err) {
      console.warn("Subscription check error:", err);
      setSubscribed(false);
      setSubscriptionTier(null);
      setSubscriptionEnd(null);
    } finally {
      setCheckingSubscription(false);
    }
  }, []);

  const loadRole = useCallback(async (userId: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).limit(1);
    setUserRole(data?.[0]?.role ?? null);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
      if (session?.user) {
        checkSubscription();
        loadRole(session.user.id);
      } else {
        setSubscribed(false);
        setSubscriptionTier(null);
        setSubscriptionEnd(null);
        setCheckingSubscription(false);
        setUserRole(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session?.user) {
        checkSubscription();
        loadRole(session.user.id);
      } else {
        setCheckingSubscription(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [checkSubscription, loadRole]);

  // Auto-refresh subscription every 60s
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(checkSubscription, 60_000);
    return () => clearInterval(interval);
  }, [session, checkSubscription]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      loading,
      signOut,
      subscribed,
      subscriptionTier,
      subscriptionEnd,
      checkingSubscription,
      refreshSubscription: checkSubscription,
      userRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
