import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Upload, FileSpreadsheet, Zap, Eye, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActivityLog, type ActivityEntry } from "@/hooks/useActivityLog";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const actionIcons: Record<string, typeof Activity> = {
  "file_uploaded": Upload,
  "data_processed": FileSpreadsheet,
  "insight_generated": Zap,
  "report_viewed": Eye,
};

const actionLabels: Record<string, string> = {
  "file_uploaded": "Uploaded a file",
  "data_processed": "Data processed",
  "insight_generated": "Insight generated",
  "report_viewed": "Viewed a report",
};

const ActivityPanel = () => {
  const [expanded, setExpanded] = useState(false);
  const { activities, loading } = useActivityLog();

  if (loading && activities.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <CardTitle className="font-display text-base">Recent Activity</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <CardContent className="pt-0">
              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No recent activity</p>
              ) : (
                <div className="space-y-1">
                  {activities.slice(0, 10).map((a) => (
                    <ActivityItem key={a.id} activity={a} />
                  ))}
                </div>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
};

const ActivityItem = ({ activity }: { activity: ActivityEntry }) => {
  const Icon = actionIcons[activity.action] || Activity;
  const label = actionLabels[activity.action] || activity.action;

  return (
    <div className="flex items-center gap-3 py-2 px-1">
      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{label}</p>
        {activity.resource_type && (
          <p className="text-[11px] text-muted-foreground truncate">
            {activity.resource_type}{activity.resource_id ? `: ${activity.resource_id}` : ""}
          </p>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground/60 shrink-0">
        {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
      </span>
    </div>
  );
};

export default ActivityPanel;
