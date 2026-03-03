import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to realtime changes on sell_out_data for the current user.
 * Calls `onDataChange` whenever an INSERT, UPDATE, or DELETE occurs,
 * so the consumer can refetch dashboard data.
 *
 * Uses a debounce (3s) to avoid thrashing during batch inserts
 * (which fire hundreds of INSERT events in quick succession).
 */
export function useRealtimeSellOut(
  userId: string | undefined,
  onDataChange: () => void
) {
  const cbRef = useRef(onDataChange);
  cbRef.current = onDataChange;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          // Debounce: wait 3s after the LAST event before refetching.
          // During a batch insert of 3,000 rows this avoids 3,000 refetches
          // and instead fires once after the batch completes.
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            cbRef.current();
          }, 3000);
        }
      )
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
