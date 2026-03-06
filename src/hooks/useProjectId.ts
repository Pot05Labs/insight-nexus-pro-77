import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared hook to resolve the current user's active project ID.
 * Eliminates duplicated "get user → get latest project" logic
 * across useSellOutData, useCampaignData, and all RPC hooks.
 */
export function useProjectId() {
  return useQuery({
    queryKey: ["project-id"],
    queryFn: async (): Promise<string | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      return projects?.[0]?.id ?? null;
    },
    staleTime: 60_000, // Project rarely changes — cache for 1 minute
    refetchOnWindowFocus: false,
  });
}
