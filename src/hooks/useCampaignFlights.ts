import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjectId } from "./useProjectId";
import type { GlobalFilters } from "@/contexts/GlobalFilterContext";

export interface CampaignFlightRow {
  campaign_name: string;
  platform: string;
  flight_start: string;
  flight_end: string;
  total_spend: number;
}

export function useCampaignFlights(
  filters: GlobalFilters,
  platform?: string | null,
  limit = 30,
) {
  const { data: projectId } = useProjectId();

  return useQuery({
    queryKey: ["campaign-flights", projectId, filters, platform, limit],
    queryFn: async (): Promise<CampaignFlightRow[]> => {
      const { data, error } = await supabase.rpc("get_campaign_flights", {
        p_project_id: projectId!,
        p_platform: platform ?? null,
        p_date_from: filters.dateRange.from ?? null,
        p_date_to: filters.dateRange.to ?? null,
        p_limit: limit,
      });

      if (error) throw error;
      return ((data as unknown[]) ?? []).map((row: unknown) => {
        const r = row as Record<string, unknown>;
        return {
          campaign_name: String(r.campaign_name ?? "Unnamed"),
          platform: String(r.platform ?? "Unknown"),
          flight_start: String(r.flight_start ?? ""),
          flight_end: String(r.flight_end ?? ""),
          total_spend: Number(r.total_spend ?? 0),
        };
      });
    },
    enabled: !!projectId,
    placeholderData: keepPreviousData,
  });
}
