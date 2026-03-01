import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";

const STORAGE_KEY = "ss-cookie-consent";

type ConsentValue = "all" | "necessary" | "declined";

const CookieConsent = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) setVisible(true);
  }, []);

  const handleConsent = (value: ConsentValue) => {
    localStorage.setItem(STORAGE_KEY, value);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[100] p-4 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-2xl rounded-xl border border-border bg-card shadow-lg p-5">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Cookie className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">We use cookies</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                We use cookies to keep you signed in and improve your experience. Analytics
                cookies help us understand how you use SignalStack so we can make it better.
                You can accept all cookies, only necessary ones, or decline optional cookies.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => handleConsent("all")} className="text-xs">
                Accept All
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleConsent("necessary")} className="text-xs">
                Necessary Only
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleConsent("declined")} className="text-xs text-muted-foreground">
                Decline
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;
