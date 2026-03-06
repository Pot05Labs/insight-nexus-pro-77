import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
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
    .order("created_at", { ascending: false })
    .limit(1);
  const projectId = projects?.[0]?.id;
  if (!projectId) return [];

  // Fetch rows with parallel batch pagination for speed.
  // PostgREST max_rows = 1000, so PAGE_SIZE <= 1000.
  // Fires batches of BATCH_SIZE concurrent requests instead of serial.
  const PAGE_SIZE = 1000;
  const MAX_ROWS = 50_000;
  const BATCH_SIZE = 5;
  const COLUMNS = "id, product_name_raw, brand, category, retailer, store_location, region, date, revenue, units_sold, cost, sku, sub_brand, format_size, units_supplied";

  // First page — determine if more data exists
  const { data: firstPage, error: firstError } = await supabase
    .from("sell_out_data")
    .select(COLUMNS)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("date", { ascending: true })
    .range(0, PAGE_SIZE - 1);

  if (firstError) {
    console.error("[useSellOutData] First page error", firstError.message);
    return [];
  }

  const firstRows = (firstPage as SellOutRow[]) ?? [];
  if (firstRows.length < PAGE_SIZE) {
    console.log(`[useSellOutData] Fetched ${firstRows.length} sell-out rows (single page)`);
    return firstRows;
  }

  // More pages needed — fetch in parallel batches
  let allRows: SellOutRow[] = [...firstRows];
  let offset = PAGE_SIZE;
  let done = false;

  while (!done && allRows.length < MAX_ROWS) {
    const fetches: Promise<SellOutRow[]>[] = [];
    for (let i = 0; i < BATCH_SIZE && offset < MAX_ROWS; i++) {
      const start = offset;
      fetches.push(
        Promise.resolve(
          supabase
            .from("sell_out_data")
            .select(COLUMNS)
            .eq("project_id", projectId)
            .is("deleted_at", null)
            .order("date", { ascending: true })
            .range(start, start + PAGE_SIZE - 1)
        ).then(({ data, error }) => {
          if (error) { console.error("[useSellOutData] Batch error at", start, error.message); return []; }
          return (data as SellOutRow[]) ?? [];
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
      console.warn(`[useSellOutData] Capped at ${MAX_ROWS.toLocaleString()} rows.`);
      break;
    }
  }

  console.log(`[useSellOutData] Fetched ${allRows.length} total sell-out rows`);
  return allRows;
}

export function useSellOutData() {
  const queryClient = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ["sell-out-data"],
    queryFn: fetchSellOutData,
    placeholderData: keepPreviousData,
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
