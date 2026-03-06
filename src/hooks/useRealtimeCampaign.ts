import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to realtime changes on campaign_data_v2 for the current user.
 * Calls `onDataChange` whenever an INSERT, UPDATE, or DELETE occurs,
 * so the consumer can refetch campaign data.
 *
 * Uses a debounce (800ms) to avoid thrashing during batch inserts
 * (which fire hundreds of INSERT events in quick succession).
 */
export function useRealtimeCampaign(
  userId: string | undefined,
  onDataChange: () => void
) {
  const cbRef = useRef(onDataChange);
  cbRef.current = onDataChange;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("realtime-campaign")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "campaign_data_v2",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Debounce: wait 800ms after the LAST event before refetching.
          // During a batch insert this avoids hundreds of refetches
          // and instead fires once after the batch completes.
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            cbRef.current();
          }, 800);
        }
      )
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
