import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjectId } from "./useProjectId";
import type { GlobalFilters } from "@/contexts/GlobalFilterContext";

export interface CampaignKPIs {
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  total_revenue: number;
  campaign_count: number;
}

export function useCampaignKPIs(filters: GlobalFilters, platform?: string | null) {
  const { data: projectId } = useProjectId();

  return useQuery({
    queryKey: ["campaign-kpis", projectId, filters, platform],
    queryFn: async (): Promise<CampaignKPIs> => {
      const { data, error } = await supabase.rpc("get_campaign_kpis", {
        p_project_id: projectId!,
        p_platform: platform ?? null,
        p_date_from: filters.dateRange.from ?? null,
        p_date_to: filters.dateRange.to ?? null,
      });

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        total_spend: Number(row?.total_spend ?? 0),
        total_impressions: Number(row?.total_impressions ?? 0),
        total_clicks: Number(row?.total_clicks ?? 0),
        total_conversions: Number(row?.total_conversions ?? 0),
        total_revenue: Number(row?.total_revenue ?? 0),
        campaign_count: Number(row?.campaign_count ?? 0),
      };
    },
    enabled: !!projectId,
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });
}
