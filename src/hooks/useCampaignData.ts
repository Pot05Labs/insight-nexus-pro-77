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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const projectId = projects?.[0]?.id;
  if (!projectId) return [];

  // Paginate to retrieve ALL campaign rows (no arbitrary limit).
  // PAGE_SIZE must be <= Supabase PostgREST max_rows (default 1000).
  const PAGE_SIZE = 1000;
  let allRows: CampaignRow[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("campaign_data_v2")
      .select("flight_start,flight_end,platform,channel,campaign_name,impressions,clicks,spend,conversions,revenue")
      .is("deleted_at", null)
      .eq("project_id", projectId)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("[useCampaignData] Fetch error at offset", offset, error.message);
      break;
    }

    const rows = (data as CampaignRow[]) ?? [];
    allRows = allRows.concat(rows);
    offset += PAGE_SIZE;
    hasMore = rows.length === PAGE_SIZE;
  }

  console.log(`[useCampaignData] Fetched ${allRows.length} total campaign rows`);
  return allRows;
}

export function useCampaignData() {
  const queryClient = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ["campaign-data"],
    queryFn: fetchCampaignData,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["campaign-data"] });

  return { data, loading: isLoading, refetch };
}
