import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
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

  // Parallel batch pagination for speed.
  // PostgREST max_rows = 1000, fires BATCH_SIZE concurrent requests.
  const PAGE_SIZE = 1000;
  const MAX_ROWS = 50_000;
  const BATCH_SIZE = 5;
  const COLUMNS = "flight_start,flight_end,platform,channel,campaign_name,impressions,clicks,spend,conversions,revenue";

  // First page — determine if more data exists
  const { data: firstPage, error: firstError } = await supabase
    .from("campaign_data_v2")
    .select(COLUMNS)
    .is("deleted_at", null)
    .eq("project_id", projectId)
    .range(0, PAGE_SIZE - 1);

  if (firstError) {
    console.error("[useCampaignData] First page error", firstError.message);
    return [];
  }

  const firstRows = (firstPage as CampaignRow[]) ?? [];
  if (firstRows.length < PAGE_SIZE) {
    console.log(`[useCampaignData] Fetched ${firstRows.length} campaign rows (single page)`);
    return firstRows;
  }

  // More pages needed — fetch in parallel batches
  let allRows: CampaignRow[] = [...firstRows];
  let offset = PAGE_SIZE;
  let done = false;

  while (!done && allRows.length < MAX_ROWS) {
    const fetches: Promise<CampaignRow[]>[] = [];
    for (let i = 0; i < BATCH_SIZE && offset < MAX_ROWS; i++) {
      const start = offset;
      fetches.push(
        Promise.resolve(
          supabase
            .from("campaign_data_v2")
            .select(COLUMNS)
            .is("deleted_at", null)
            .eq("project_id", projectId)
            .range(start, start + PAGE_SIZE - 1)
        ).then(({ data, error }) => {
          if (error) { console.error("[useCampaignData] Batch error at", start, error.message); return []; }
          return (data as CampaignRow[]) ?? [];
        })
      );
      offset += PAGE_SIZE;
    }

    const results = await Promise.all(fetches);
    for (const rows of results) {
      allRows = allRows.concat(rows);
      if (rows.length < PAGE_SIZE) { done = true; break; }
    }

    if (allRows.length >= MAX_ROWS) {
      allRows = allRows.slice(0, MAX_ROWS);
      console.warn(`[useCampaignData] Capped at ${MAX_ROWS.toLocaleString()} rows.`);
      break;
    }
  }

  console.log(`[useCampaignData] Fetched ${allRows.length} total campaign rows`);
  return allRows;
}

export function useCampaignData() {
  const queryClient = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ["campaign-data"],
    queryFn: fetchCampaignData,
    placeholderData: keepPreviousData,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["campaign-data"] });

  return { data, loading: isLoading, refetch };
}
