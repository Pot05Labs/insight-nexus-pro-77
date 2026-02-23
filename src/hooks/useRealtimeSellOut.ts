import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to realtime changes on sell_out_data for the current user.
 * Calls `onDataChange` whenever an INSERT, UPDATE, or DELETE occurs,
 * so the consumer can refetch dashboard data.
 */
export function useRealtimeSellOut(
  userId: string | undefined,
  onDataChange: () => void
) {
  const cbRef = useRef(onDataChange);
  cbRef.current = onDataChange;

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("realtime-sell-out")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sell_out_data",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          cbRef.current();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
