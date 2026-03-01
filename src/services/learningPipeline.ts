import { supabase } from "@/integrations/supabase/client";

/**
 * Learning Pipeline — builds intelligence that compounds with each upload.
 * Triggered after successful file processing.
 * Stores structured knowledge in client_intelligence table.
 */

interface DataProfile {
  dateRange: { min: string; max: string };
  retailers: string[];
  brands: string[];
  categories: string[];
  totalRevenue: number;
  totalUnits: number;
  uniqueProducts: number;
  rowCount: number;
}

interface TrendInsight {
  metric: string;
  direction: "up" | "down" | "flat";
  magnitude: number;
  period: string;
}

/**
 * Run the learning pipeline for a project after an upload completes.
 * Steps:
 * 1. Build data profile (SQL aggregation, no AI)
 * 2. Detect trends (compare to previous profiles)
 * 3. Store intelligence records
 */
export async function runLearningPipeline(projectId: string, userId: string): Promise<void> {
  try {
    // Step 1: Build data profile from sell_out_data
    const profile = await buildDataProfile(projectId);
    if (!profile) return;

    // Step 2: Upsert data_profile intelligence
    await upsertIntelligence(userId, projectId, "data_profile", profile, 0.9, profile.rowCount);

    // Step 3: Detect trends by comparing to previous profile
    const trends = await detectTrends(projectId, profile);
    if (trends.length > 0) {
      await upsertIntelligence(userId, projectId, "trend", { trends }, 0.7, profile.rowCount);
    }

    // Step 4: Build entity map (unique product names, retailer hierarchy)
    const entityMap = await buildEntityMap(projectId);
    if (entityMap) {
      await upsertIntelligence(userId, projectId, "entity_map", entityMap, 0.8, profile.rowCount);
    }

    console.info("[LearningPipeline] Intelligence updated for project:", projectId);
  } catch (err) {
    console.error("[LearningPipeline] Failed:", err);
  }
}

async function buildDataProfile(projectId: string): Promise<DataProfile | null> {
  const { data: rows } = await supabase
    .from("sell_out_data")
    .select("date, retailer, brand, category, product_name_raw, revenue, units_sold")
    .eq("project_id", projectId)
    .is("deleted_at", null);

  if (!rows || rows.length === 0) return null;

  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  const retailers = [...new Set(rows.map((r) => r.retailer).filter(Boolean))];
  const brands = [...new Set(rows.map((r) => r.brand).filter(Boolean))];
  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))];
  const uniqueProducts = new Set(rows.map((r) => r.product_name_raw).filter(Boolean)).size;
  const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const totalUnits = rows.reduce((s, r) => s + Number(r.units_sold ?? 0), 0);

  return {
    dateRange: { min: dates[0] ?? "", max: dates[dates.length - 1] ?? "" },
    retailers: retailers as string[],
    brands: brands as string[],
    categories: categories as string[],
    totalRevenue: Math.round(totalRevenue),
    totalUnits: Math.round(totalUnits),
    uniqueProducts,
    rowCount: rows.length,
  };
}

async function detectTrends(projectId: string, currentProfile: DataProfile): Promise<TrendInsight[]> {
  // Fetch previous data_profile intelligence to compare
  const { data: prevIntel } = await supabase
    .from("client_intelligence")
    .select("content")
    .eq("project_id", projectId)
    .eq("intelligence_type", "data_profile")
    .is("deleted_at", null)
    .order("last_updated_at", { ascending: false })
    .limit(1);

  if (!prevIntel || prevIntel.length === 0) return [];

  const prev = prevIntel[0].content as unknown as DataProfile;
  if (!prev?.totalRevenue) return [];

  const trends: TrendInsight[] = [];

  // Revenue trend
  const revDelta = currentProfile.totalRevenue - prev.totalRevenue;
  const revPct = prev.totalRevenue > 0 ? (revDelta / prev.totalRevenue) * 100 : 0;
  if (Math.abs(revPct) > 1) {
    trends.push({
      metric: "revenue",
      direction: revPct > 0 ? "up" : "down",
      magnitude: Math.round(revPct * 10) / 10,
      period: `${prev.dateRange?.max ?? "?"} to ${currentProfile.dateRange.max}`,
    });
  }

  // Units trend
  const unitsDelta = currentProfile.totalUnits - prev.totalUnits;
  const unitsPct = prev.totalUnits > 0 ? (unitsDelta / prev.totalUnits) * 100 : 0;
  if (Math.abs(unitsPct) > 1) {
    trends.push({
      metric: "units",
      direction: unitsPct > 0 ? "up" : "down",
      magnitude: Math.round(unitsPct * 10) / 10,
      period: `${prev.dateRange?.max ?? "?"} to ${currentProfile.dateRange.max}`,
    });
  }

  // New retailer detection
  const prevRetailers = new Set(prev.retailers ?? []);
  const newRetailers = (currentProfile.retailers ?? []).filter((r) => !prevRetailers.has(r));
  if (newRetailers.length > 0) {
    trends.push({
      metric: "new_retailers",
      direction: "up",
      magnitude: newRetailers.length,
      period: newRetailers.join(", "),
    });
  }

  // Product portfolio change
  const productDelta = currentProfile.uniqueProducts - (prev.uniqueProducts ?? 0);
  if (Math.abs(productDelta) > 2) {
    trends.push({
      metric: "product_range",
      direction: productDelta > 0 ? "up" : "down",
      magnitude: productDelta,
      period: `${prev.uniqueProducts ?? 0} → ${currentProfile.uniqueProducts}`,
    });
  }

  return trends;
}

async function buildEntityMap(projectId: string): Promise<Record<string, unknown> | null> {
  // Build product name → brand mapping
  const { data: rows } = await supabase
    .from("sell_out_data")
    .select("product_name_raw, brand, retailer, category")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .limit(5000);

  if (!rows || rows.length === 0) return null;

  // Product alias dictionary
  const productBrands: Record<string, string> = {};
  const retailerCategories: Record<string, Set<string>> = {};

  for (const r of rows) {
    if (r.product_name_raw && r.brand) {
      productBrands[r.product_name_raw] = r.brand;
    }
    if (r.retailer && r.category) {
      if (!retailerCategories[r.retailer]) retailerCategories[r.retailer] = new Set();
      retailerCategories[r.retailer].add(r.category);
    }
  }

  return {
    productBrands: Object.fromEntries(Object.entries(productBrands).slice(0, 200)),
    retailerCategories: Object.fromEntries(
      Object.entries(retailerCategories).map(([k, v]) => [k, [...v]])
    ),
  };
}

async function upsertIntelligence(
  userId: string,
  projectId: string,
  intelligenceType: string,
  content: unknown,
  confidence: number,
  dataPoints: number
): Promise<void> {
  // Check if intelligence of this type already exists for this project
  const { data: existing } = await supabase
    .from("client_intelligence")
    .select("id, data_points_used")
    .eq("project_id", projectId)
    .eq("intelligence_type", intelligenceType)
    .is("deleted_at", null)
    .limit(1);

  if (existing && existing.length > 0) {
    // Update existing — confidence increases with more data
    const prevPoints = existing[0].data_points_used ?? 0;
    const newConfidence = Math.min(0.95, confidence + (prevPoints > 100 ? 0.05 : 0));
    await supabase
      .from("client_intelligence")
      .update({
        content,
        confidence: newConfidence,
        data_points_used: dataPoints,
        last_updated_at: new Date().toISOString(),
      })
      .eq("id", existing[0].id);
  } else {
    // Insert new
    await supabase.from("client_intelligence").insert({
      user_id: userId,
      project_id: projectId,
      intelligence_type: intelligenceType,
      content,
      confidence,
      data_points_used: dataPoints,
    });
  }
}
