import { useState, useEffect, useCallback } from "react";
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

export function useSellOutData() {
  const [data, setData] = useState<SellOutRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: projects } = await supabase.from("projects").select("id").limit(1);
    const projectId = projects?.[0]?.id;
    if (!projectId) { setLoading(false); return; }

    const { data: rows } = await supabase
      .from("sell_out_data")
      .select("*")
      .eq("project_id", projectId)
      .order("date", { ascending: true });

    setData((rows as SellOutRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, refetch: load };
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
