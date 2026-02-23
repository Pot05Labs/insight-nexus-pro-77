import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, CreditCard, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TIERS, TierKey } from "@/lib/stripe-tiers";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const PricingPage = () => {
  const [loading, setLoading] = useState<string | null>(null);
  const { subscribed, subscriptionTier: currentTier, subscriptionEnd, checkingSubscription: checking, refreshSubscription } = useAuth();
  const { toast } = useToast();

  // Refresh on mount and after checkout redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      refreshSubscription();
      toast({ title: "Welcome!", description: "Your subscription is now active." });
    }
  }, [refreshSubscription]);

  const handleCheckout = async (priceId: string, tierKey: string, planName: string) => {
    setLoading(tierKey);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: { priceId, planName },
      });
      if (error) throw error;
      if (data.url) window.open(data.url, "_blank");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const handleManage = async () => {
    setLoading("manage");
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data.url) window.open(data.url, "_blank");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-bold">Plans & Billing</h1>
        <p className="text-muted-foreground text-sm">Choose the plan that fits your business.</p>
      </div>

      {subscribed && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-primary" />
              <div>
                <span className="font-medium">
                  You're on the <span className="text-primary capitalize">{currentTier}</span> plan
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="border-green-500 text-green-600 bg-green-500/10 text-xs">Active</Badge>
                  <span className="text-xs text-muted-foreground">Next billing: {formatDate(subscriptionEnd)}</span>
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleManage} disabled={loading === "manage"}>
              {loading === "manage" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-1" />}
              Manage billing
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {(Object.entries(TIERS) as [TierKey, typeof TIERS[TierKey]][]).map(([key, tier], i) => {
          const isActive = currentTier === key;
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className={`relative h-full flex flex-col ${key === "professional" ? "border-primary shadow-lg" : ""} ${isActive ? "ring-2 ring-primary" : ""}`}>
                {key === "professional" && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                  </div>
                )}
                {isActive && (
                  <div className="absolute -top-3 right-4">
                    <Badge variant="outline" className="border-primary text-primary bg-primary/10">Your Plan</Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="font-display text-xl">{tier.name}</CardTitle>
                  <CardDescription>
                    <span className="text-3xl font-bold text-foreground">{tier.price}</span>
                    {key !== "enterprise" && <span className="text-muted-foreground"> /month</span>}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <ul className="space-y-3 flex-1">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full mt-6"
                    variant={isActive ? "outline" : key === "professional" ? "default" : "secondary"}
                    disabled={key === "enterprise" ? false : (checking || isActive || loading === key)}
                    onClick={() => {
                      if (key === "enterprise") {
                        window.location.href = "mailto:hello@potstrategy.com?subject=Enterprise%20Plan%20Inquiry";
                      } else {
                        handleCheckout(tier.priceId, key, tier.name);
                      }
                    }}
                  >
                    {loading === key && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {isActive ? "Current plan" : key === "enterprise" ? "Contact Us" : "Get started"}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default PricingPage;
