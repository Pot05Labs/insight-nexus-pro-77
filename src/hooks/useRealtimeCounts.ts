import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns live counts for sidebar badges:
 * - pendingUploads: uploads in "uploaded" or "processing" status
 * - newDataCount: sell_out_data rows inserted in the last 24 hours
 */
export function useRealtimeCounts(userId: string | undefined) {
  const [pendingUploads, setPendingUploads] = useState(0);
  const [newDataCount, setNewDataCount] = useState(0);

  // Initial fetch
  useEffect(() => {
    if (!userId) return;

    const fetchCounts = async () => {
      const { count: pending } = await supabase
        .from("data_uploads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["uploaded", "processing"])
        .neq("status", "archived");
      setPendingUploads(pending ?? 0);

      const yesterday = new Date(Date.now() - 86_400_000).toISOString();
      const { count: recent } = await supabase
        .from("sell_out_data")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("deleted_at", null)
        .gte("created_at", yesterday);
      setNewDataCount(recent ?? 0);
    };
    fetchCounts();
  }, [userId]);

  // Realtime updates for uploads
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("badge-uploads")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "data_uploads",
          filter: `user_id=eq.${userId}`,
        },
        async () => {
          const { count } = await supabase
            .from("data_uploads")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .in("status", ["uploaded", "processing"]);
          setPendingUploads(count ?? 0);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Realtime updates for sell_out_data
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("badge-sell-out")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sell_out_data",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          setNewDataCount((c) => c + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { pendingUploads, newDataCount };
}
