import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjectId } from "./useProjectId";
import type { GlobalFilters } from "@/contexts/GlobalFilterContext";

export interface SellOutKPIs {
  total_revenue: number;
  total_units: number;
  total_cost: number;
  row_count: number;
  distinct_products: number;
  distinct_retailers: number;
}

export function useSellOutKPIs(filters: GlobalFilters) {
  const { data: projectId } = useProjectId();

  return useQuery({
    queryKey: ["sell-out-kpis", projectId, filters],
    queryFn: async (): Promise<SellOutKPIs> => {
      const { data, error } = await supabase.rpc("get_sell_out_kpis", {
        p_project_id: projectId!,
        p_brand: filters.brand ?? null,
        p_retailer: filters.retailer ?? null,
        p_province: filters.province ?? null,
        p_date_from: filters.dateRange.from ?? null,
        p_date_to: filters.dateRange.to ?? null,
      });

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        total_revenue: Number(row?.total_revenue ?? 0),
        total_units: Number(row?.total_units ?? 0),
        total_cost: Number(row?.total_cost ?? 0),
        row_count: Number(row?.row_count ?? 0),
        distinct_products: Number(row?.distinct_products ?? 0),
        distinct_retailers: Number(row?.distinct_retailers ?? 0),
      };
    },
    enabled: !!projectId,
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });
}
