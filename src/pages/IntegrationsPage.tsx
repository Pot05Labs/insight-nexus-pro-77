import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Target, Video, Search, BarChart, Store, ExternalLink } from "lucide-react";

const integrations = [
  {
    name: "Amazon Seller Central",
    description: "Sync sales, inventory, and advertising data from Amazon.",
    icon: ShoppingCart,
    status: "coming_soon" as const,
  },
  {
    name: "Walmart Connect",
    description: "Pull retail sales and campaign performance from Walmart.",
    icon: Store,
    status: "coming_soon" as const,
  },
  {
    name: "Meta Ads",
    description: "Import campaign performance data from Facebook & Instagram Ads.",
    icon: Target,
    status: "coming_soon" as const,
  },
  {
    name: "Google Ads",
    description: "Connect your Google Ads account for unified campaign tracking.",
    icon: Search,
    status: "coming_soon" as const,
  },
  {
    name: "TikTok Ads",
    description: "Bring in TikTok advertising metrics and creative performance.",
    icon: Video,
    status: "coming_soon" as const,
  },
  {
    name: "Google Sheets",
    description: "Pull data directly from shared Google Sheets.",
    icon: BarChart,
    status: "coming_soon" as const,
  },
];

const statusLabel = {
  connected: { text: "Connected", className: "bg-success/10 text-success border-success/30" },
  coming_soon: { text: "Coming Soon", className: "bg-muted text-muted-foreground border-border" },
};

const IntegrationsPage = () => {
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-bold">Integrations</h1>
        <p className="text-muted-foreground text-sm">Connect your data sources for automated imports.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {integrations.map((integration, i) => {
          const status = statusLabel[integration.status];
          return (
            <motion.div
              key={integration.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="h-full flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <integration.icon className="h-5 w-5 text-primary" />
                    </div>
                    <Badge variant="outline" className={status.className}>
                      {status.text}
                    </Badge>
                  </div>
                  <CardTitle className="font-display text-base mt-3">{integration.name}</CardTitle>
                  <CardDescription className="text-xs">{integration.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <Button variant="outline" size="sm" className="w-full" disabled>
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Connect
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

export default IntegrationsPage;
