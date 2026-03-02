import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to realtime changes on campaign_data_v2 for the current user.
 * Calls `onDataChange` whenever an INSERT, UPDATE, or DELETE occurs,
 * so the consumer can refetch campaign data.
 */
export function useRealtimeCampaign(
  userId: string | undefined,
  onDataChange: () => void
) {
  const cbRef = useRef(onDataChange);
  cbRef.current = onDataChange;

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
          cbRef.current();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
