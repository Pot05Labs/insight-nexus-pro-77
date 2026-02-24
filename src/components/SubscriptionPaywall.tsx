import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock } from "lucide-react";

const SubscriptionPaywall = ({ children }: { children: React.ReactNode }) => {
  const { subscribed, checkingSubscription, userRole } = useAuth();
  const navigate = useNavigate();

  // Admin bypasses paywall
  if (userRole === "admin") return <>{children}</>;

  // Still checking — show skeleton to avoid content flash
  if (checkingSubscription) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!subscribed) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-md">
          <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <Lock className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="font-display text-xl font-bold">Subscribe to unlock SignalStack analytics</h2>
          <p className="text-muted-foreground text-sm">
            You need an active subscription to use this feature. Choose a plan to get started.
          </p>
          <Button onClick={() => navigate("/billing")}>View Plans</Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default SubscriptionPaywall;
