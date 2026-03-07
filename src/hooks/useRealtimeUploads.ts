import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { RealtimeChannel } from "@supabase/supabase-js";

type UploadRow = {
  id: string;
  file_name: string;
  status: string;
  row_count: number | null;
  created_at: string;
};

/** All dashboard query keys that must be refreshed when new data lands */
const DASHBOARD_QUERY_KEYS = [
  "sell-out-data", "campaign-data", "computed-metrics",
  "sell-out-kpis", "campaign-kpis",
  "sell-out-agg", "campaign-agg",
  "top-products", "campaign-flights",
  "filter-options", "daily-revenue",
];

export function useRealtimeUploads(userId: string | undefined) {
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const fetchUploads = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("data_uploads")
      .select("id, file_name, status, row_count, created_at")
      .eq("user_id", userId)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(50);
    setUploads(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchUploads();
  }, [fetchUploads]);

  useEffect(() => {
    if (!userId) return;

    const channel: RealtimeChannel = supabase
      .channel("realtime-uploads")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "data_uploads",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const eventType = payload.eventType;
          const newRow = payload.new as UploadRow;

          if (eventType === "INSERT") {
            setUploads((prev) => [newRow, ...prev]);
          } else if (eventType === "UPDATE") {
            setUploads((prev) =>
              prev.map((u) => (u.id === newRow.id ? { ...u, ...newRow } : u))
            );

            // ── Fire 2 + 3: When upload completes, invalidate ALL dashboard
            // caches so the user sees new data without a manual refresh. ──
            if (newRow.status === "ready") {
              toast({
                title: "Upload complete",
                description: `"${newRow.file_name}" has finished processing.`,
              });
              // Force refetch of every dashboard query
              for (const key of DASHBOARD_QUERY_KEYS) {
                queryClient.invalidateQueries({ queryKey: [key] });
              }
            } else if (newRow.status === "error") {
              toast({
                title: "Upload failed",
                description: `"${newRow.file_name}" encountered an error.`,
                variant: "destructive",
              });
            }
          } else if (eventType === "DELETE") {
            const oldRow = payload.old as { id: string };
            setUploads((prev) => prev.filter((u) => u.id !== oldRow.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, toast, queryClient]);

  return { uploads, loading, refetch: fetchUploads };
}
