import { supabase } from "@/integrations/supabase/client";
import { canonicalProvince, resolveProvince } from "@/lib/sa-store-provinces";

export type ProvinceRepairResult = {
  scanned: number;
  updated: number;
  unresolved: number;
  conflicts: number;
};

export type ProvinceRepairRow = {
  id: string;
  region: string | null;
  store_location: string | null;
};

export type ProvinceRepairPlan = ProvinceRepairResult & {
  updatesByProvince: Record<string, string[]>;
};

const PAGE_SIZE = 1000;
const UPDATE_BATCH_SIZE = 200;

export function planProvinceRepairs(rows: ProvinceRepairRow[]): ProvinceRepairPlan {
  const updatesByProvince: Record<string, string[]> = {};
  let unresolved = 0;
  let conflicts = 0;

  for (const row of rows) {
    const validRegion = canonicalProvince(row.region);
    const inferredFromStore = row.store_location
      ? resolveProvince({ storeLocation: row.store_location })
      : null;

    if (validRegion) {
      if (inferredFromStore && inferredFromStore !== validRegion) conflicts++;
      continue;
    }

    const resolved = resolveProvince({
      region: row.region,
      storeLocation: row.store_location,
    });

    if (!resolved) {
      unresolved++;
      continue;
    }

    updatesByProvince[resolved] ??= [];
    updatesByProvince[resolved].push(row.id);
  }

  const updated = Object.values(updatesByProvince).reduce((sum, ids) => sum + ids.length, 0);

  return {
    scanned: rows.length,
    updated,
    unresolved,
    conflicts,
    updatesByProvince,
  };
}

export async function repairProvinceMappings(projectId: string): Promise<ProvinceRepairResult> {
  const rows: ProvinceRepairRow[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("sell_out_data")
      .select("id, region, store_location")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const page = (data as ProvinceRepairRow[] | null) ?? [];
    rows.push(...page);
    offset += PAGE_SIZE;
    hasMore = page.length === PAGE_SIZE;
  }

  const plan = planProvinceRepairs(rows);

  for (const [province, ids] of Object.entries(plan.updatesByProvince)) {
    for (let idx = 0; idx < ids.length; idx += UPDATE_BATCH_SIZE) {
      const batchIds = ids.slice(idx, idx + UPDATE_BATCH_SIZE);
      const { error } = await supabase
        .from("sell_out_data")
        .update({ region: province })
        .eq("project_id", projectId)
        .in("id", batchIds);

      if (error) throw new Error(error.message);
    }
  }

  return {
    scanned: plan.scanned,
    updated: plan.updated,
    unresolved: plan.unresolved,
    conflicts: plan.conflicts,
  };
}
