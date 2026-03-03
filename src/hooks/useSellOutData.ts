import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SellOutRow {
  id: string;
  product_name_raw: string | null;
  brand: string | null;
  category: string | null;
  retailer: string | null;
  store_location: string | null;
  region: string | null;
  date: string | null;
  revenue: number | null;
  units_sold: number | null;
  cost: number | null;
  sku: string | null;
  sub_brand: string | null;
  format_size: string | null;
  units_supplied: number | null;
}

async function fetchSellOutData(): Promise<SellOutRow[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);
  const projectId = projects?.[0]?.id;
  if (!projectId) return [];

  const { data: rows } = await supabase
    .from("sell_out_data")
    .select("id, product_name_raw, brand, category, retailer, store_location, region, date, revenue, units_sold, cost, sku, sub_brand, format_size, units_supplied")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("date", { ascending: true })
    .limit(50000);

  return (rows as SellOutRow[]) ?? [];
}

export function useSellOutData() {
  const queryClient = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ["sell-out-data"],
    queryFn: fetchSellOutData,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["sell-out-data"] });

  return { data, loading: isLoading, refetch };
}

// Currency formatter for ZAR
export const fmtZAR = (n: number) => {
  if (n >= 1_000_000) return `R${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `R${(n / 1_000).toFixed(1)}K`;
  return `R${n.toFixed(0)}`;
};

// Aggregation helper
export function aggregate<T>(rows: T[], keyFn: (r: T) => string, valFn: (r: T) => number): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of rows) {
    const k = keyFn(r) || "Unknown";
    m[k] = (m[k] ?? 0) + valFn(r);
  }
  return m;
}
