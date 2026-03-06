import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjectId } from "./useProjectId";
import type { GlobalFilters } from "@/contexts/GlobalFilterContext";

export interface TopProduct {
  product_name: string;
  total_revenue: number;
  total_units: number;
  avg_price: number;
  market_share: number;
}

export function useTopProducts(filters: GlobalFilters, limit = 10) {
  const { data: projectId } = useProjectId();

  return useQuery({
    queryKey: ["top-products", projectId, filters, limit],
    queryFn: async (): Promise<TopProduct[]> => {
      const { data, error } = await supabase.rpc("get_top_products", {
        p_project_id: projectId!,
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
          product_name: String(r.product_name ?? "Unknown"),
          total_revenue: Number(r.total_revenue ?? 0),
          total_units: Number(r.total_units ?? 0),
          avg_price: Number(r.avg_price ?? 0),
          market_share: Number(r.market_share ?? 0),
        };
      });
    },
    enabled: !!projectId,
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });
}
