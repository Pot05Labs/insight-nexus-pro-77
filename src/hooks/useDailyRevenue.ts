import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjectId } from "./useProjectId";
import type { GlobalFilters } from "@/contexts/GlobalFilterContext";

export interface DailyRevenueRow {
  day: string;
  total_revenue: number;
  total_units: number;
}

export function useDailyRevenue(filters: GlobalFilters, enabled = true) {
  const { data: projectId } = useProjectId();

  return useQuery({
    queryKey: ["daily-revenue", projectId, filters],
    queryFn: async (): Promise<DailyRevenueRow[]> => {
      const { data, error } = await supabase.rpc("get_daily_revenue", {
        p_project_id: projectId!,
        p_brand: filters.brand ?? undefined,
        p_retailer: filters.retailer ?? undefined,
        p_province: filters.province ?? undefined,
        p_date_from: filters.dateRange.from ?? undefined,
        p_date_to: filters.dateRange.to ?? undefined,
      });

      if (error) throw error;
      return ((data as unknown[]) ?? []).map((row: unknown) => {
        const r = row as Record<string, unknown>;
        return {
          day: String(r.day ?? ""),
          total_revenue: Number(r.total_revenue ?? 0),
          total_units: Number(r.total_units ?? 0),
        };
      });
    },
    enabled: !!projectId && enabled,
    placeholderData: keepPreviousData,
  });
}
