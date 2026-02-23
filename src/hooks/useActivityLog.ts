import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type ActivityEntry = {
  id: string;
  user_id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
};

export function useActivityLog() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActivities = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("activity_log")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setActivities((data as ActivityEntry[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("realtime-activity")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_log",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setActivities((prev) => [payload.new as ActivityEntry, ...prev].slice(0, 30));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const logActivity = useCallback(
    async (action: string, resourceType?: string, resourceId?: string, metadata?: Record<string, any>) => {
      if (!user) return;
      await supabase.from("activity_log").insert({
        user_id: user.id,
        action,
        resource_type: resourceType ?? null,
        resource_id: resourceId ?? null,
        metadata: metadata ?? null,
      });
    },
    [user]
  );

  return { activities, loading, logActivity, refetch: fetchActivities };
}
