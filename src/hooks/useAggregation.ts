import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjectId } from "./useProjectId";
import type { GlobalFilters } from "@/contexts/GlobalFilterContext";

/* ── Sell-Out Aggregation ─────────────────────────────────────────────────── */

export type SellOutGroupBy =
  | "retailer" | "brand" | "category" | "region" | "store_location"
  | "product_name_raw" | "date" | "month" | "day_of_week";

export interface SellOutAggRow {
  group_key: string;
  total_revenue: number;
  total_units: number;
  total_cost: number;
  row_count: number;
}

export function useSellOutAggregation(
  groupBy: SellOutGroupBy,
  filters: GlobalFilters,
  limit = 50,
  enabled = true,
) {
  const { data: projectId } = useProjectId();

  return useQuery({
    queryKey: ["sell-out-agg", projectId, groupBy, filters, limit],
    queryFn: async (): Promise<SellOutAggRow[]> => {
      const { data, error } = await supabase.rpc("get_sell_out_aggregation", {
        p_project_id: projectId!,
        p_group_by: groupBy,
        p_brand: filters.brand ?? null,
        p_retailer: filters.retailer ?? null,
        p_province: filters.province ?? null,
        p_date_from: filters.dateRange.from ?? null,
        p_date_to: filters.dateRange.to ?? null,
        p_limit: limit,
      });

      if (error) throw error;
      return ((data as unknown[]) ?? []).map((row: unknown) => {
        const r = row as Record<string, unknown>;
        return {
          group_key: String(r.group_key ?? "Unknown"),
          total_revenue: Number(r.total_revenue ?? 0),
          total_units: Number(r.total_units ?? 0),
          total_cost: Number(r.total_cost ?? 0),
          row_count: Number(r.row_count ?? 0),
        };
      });
    },
    enabled: !!projectId && enabled,
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });
}

/* ── Campaign Aggregation ─────────────────────────────────────────────────── */

export type CampaignGroupBy = "platform" | "channel" | "campaign_name" | "month";

export interface CampaignAggRow {
  group_key: string;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  total_revenue: number;
  row_count: number;
}

export function useCampaignAggregation(
  groupBy: CampaignGroupBy,
  filters: GlobalFilters,
  platform?: string | null,
  limit = 50,
  enabled = true,
) {
  const { data: projectId } = useProjectId();

  return useQuery({
    queryKey: ["campaign-agg", projectId, groupBy, filters, platform, limit],
    queryFn: async (): Promise<CampaignAggRow[]> => {
      const { data, error } = await supabase.rpc("get_campaign_aggregation", {
        p_project_id: projectId!,
        p_group_by: groupBy,
        p_platform: platform ?? null,
        p_date_from: filters.dateRange.from ?? null,
        p_date_to: filters.dateRange.to ?? null,
        p_limit: limit,
      });

      if (error) throw error;
      return ((data as unknown[]) ?? []).map((row: unknown) => {
        const r = row as Record<string, unknown>;
        return {
          group_key: String(r.group_key ?? "Unknown"),
          total_spend: Number(r.total_spend ?? 0),
          total_impressions: Number(r.total_impressions ?? 0),
          total_clicks: Number(r.total_clicks ?? 0),
          total_conversions: Number(r.total_conversions ?? 0),
          total_revenue: Number(r.total_revenue ?? 0),
          row_count: Number(r.row_count ?? 0),
        };
      });
    },
    enabled: !!projectId && enabled,
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });
}
