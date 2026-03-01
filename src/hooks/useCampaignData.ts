import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CampaignRow {
  flight_start: string | null;
  flight_end: string | null;
  platform: string | null;
  channel: string | null;
  campaign_name: string | null;
  impressions: number | null;
  clicks: number | null;
  spend: number | null;
  conversions: number | null;
  revenue: number | null;
}

async function fetchCampaignData(): Promise<CampaignRow[]> {
  const { data: projects } = await supabase.from("projects").select("id").limit(1);
  const projectId = projects?.[0]?.id;

  let query = supabase
    .from("campaign_data_v2")
    .select("flight_start,flight_end,platform,channel,campaign_name,impressions,clicks,spend,conversions,revenue")
    .is("deleted_at", null);

  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query.limit(5000);
  if (error) {
    console.error("[useCampaignData] Failed to fetch:", error);
    return [];
  }
  return (data as CampaignRow[]) ?? [];
}

export function useCampaignData() {
  const queryClient = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ["campaign-data"],
    queryFn: fetchCampaignData,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["campaign-data"] });

  return { data, loading: isLoading, refetch };
}
