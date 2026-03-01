/**
 * valueTransformer.ts — Deterministic value conversion
 *
 * Converts raw string cell values to typed values for database insert.
 * Every conversion is explicit and auditable.
 * NO LLM involvement. NO approximation.
 */

/* ------------------------------------------------------------------ */
/*  Number conversion                                                  */
/* ------------------------------------------------------------------ */

/**
 * Convert a raw string to a number.
 * Handles: "R200,000" → 200000, "4.02%" → 4.02, "2.52x" → 2.52
 * Returns null if the value cannot be parsed as a number.
 */
export function toNumber(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;

  let s = raw.trim();

  // Strip ZAR "R" prefix (handles "R200,000" and "R 200 000")
  s = s.replace(/^R\s*/i, "");

  // Strip percentage suffix
  s = s.replace(/%\s*$/, "");

  // Strip multiplier suffix (ROAS "2.52x")
  s = s.replace(/x\s*$/i, "");

  // Strip currency symbols and thousand separators
  // Handle both comma-as-thousands (200,000) and space-as-thousands (200 000)
  s = s.replace(/[£$€]/g, "");
  s = s.replace(/,/g, "");     // remove commas
  s = s.replace(/\s/g, "");    // remove spaces

  // Handle parenthetical negatives: (500) → -500
  const parenMatch = s.match(/^\((.+)\)$/);
  if (parenMatch) {
    s = "-" + parenMatch[1];
  }

  const n = Number(s);
  if (isNaN(n) || !isFinite(n)) return null;
  return n;
}

/**
 * Convert to integer (for units, quantities).
 * Rounds to nearest integer only if the original was a number.
 */
export function toInteger(raw: string | null | undefined): number | null {
  const n = toNumber(raw);
  return n !== null ? Math.round(n) : null;
}

/* ------------------------------------------------------------------ */
/*  Date conversion                                                    */
/* ------------------------------------------------------------------ */

/**
 * Convert a raw string to ISO date (YYYY-MM-DD).
 * Handles: Excel serial numbers, various date formats, month names.
 */
export function toDate(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === "") return null;

  const s = raw.trim();

  // Excel serial number (e.g., "45678")
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s);
    // Valid range: 1900-01-01 (serial 1) to ~2100 (serial ~73000)
    if (serial >= 1 && serial <= 73000) {
      const excelEpoch = new Date(1899, 11, 30);
      const d = new Date(excelEpoch.getTime() + Math.floor(serial) * 86400000);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split("T")[0];
      }
    }
  }

  // Try standard date parsing
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    // Sanity check: date should be between 1990 and 2040
    const year = d.getFullYear();
    if (year >= 1990 && year <= 2040) {
      return d.toISOString().split("T")[0];
    }
  }

  // Try DD/MM/YYYY and DD-MM-YYYY (common in SA)
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const [, dd, mm, yyyy] = dmyMatch;
    const d2 = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
    if (!isNaN(d2.getTime())) {
      return d2.toISOString().split("T")[0];
    }
  }

  // Return raw string if it looks date-like but couldn't parse
  return null;
}

/* ------------------------------------------------------------------ */
/*  String conversion                                                  */
/* ------------------------------------------------------------------ */

/**
 * Clean a string value for database insert.
 * Trims whitespace, returns null for empty strings.
 */
export function toText(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = raw.trim();
  return s.length > 0 ? s : null;
}

/* ------------------------------------------------------------------ */
/*  Row transformer                                                    */
/* ------------------------------------------------------------------ */

import type { ColumnMapping } from "./columnMapper";

/**
 * Transform a raw parsed row into a sell_out_data insert record.
 * Uses the column mapping to find source values, then converts types.
 */
export function toSellOutRecord(
  row: Record<string, string>,
  mapping: ColumnMapping,
  uploadId: string,
  userId: string,
  projectId: string,
  sourceName: string | null,
): Record<string, any> {
  const get = (canonical: string): string | null => {
    const sourceCol = mapping.fieldMap[canonical];
    return sourceCol ? (row[sourceCol] ?? null) : null;
  };

  // Revenue priority: actual_revenue (merchandise sales) > revenue (ordered value)
  const actualRevenue = toNumber(get("actual_revenue"));
  const revenue = toNumber(get("revenue"));

  return {
    user_id: userId,
    project_id: projectId,
    upload_id: uploadId,
    date: toDate(get("date")),
    product_name_raw: toText(get("product_name_raw")),
    sku: toText(get("sku")),
    retailer: toText(get("retailer")) || sourceName || null,
    store_location: toText(get("store_location")),
    region: toText(get("region")),
    category: toText(get("category")),
    brand: toText(get("brand")),
    sub_brand: toText(get("sub_brand")),
    format_size: toText(get("format_size")),
    revenue: actualRevenue ?? revenue,  // prefer merchandise sales
    units_sold: toInteger(get("units_sold")),
    units_supplied: toInteger(get("units_supplied")),
    cost: toNumber(get("cost")),
  };
}

/**
 * Transform a raw parsed row into a campaign_data_v2 insert record.
 */
export function toCampaignRecord(
  row: Record<string, string>,
  mapping: ColumnMapping,
  uploadId: string,
  userId: string,
  projectId: string,
  sourceFormat: string,
): Record<string, any> {
  const get = (canonical: string): string | null => {
    const sourceCol = mapping.fieldMap[canonical];
    return sourceCol ? (row[sourceCol] ?? null) : null;
  };

  return {
    user_id: userId,
    project_id: projectId,
    upload_id: uploadId,
    campaign_name: toText(get("campaign_name")),
    platform: toText(get("platform")),
    channel: toText(get("channel")),
    spend: toNumber(get("spend")),
    impressions: toInteger(get("impressions")),
    clicks: toInteger(get("clicks")),
    ctr: toNumber(get("ctr")),
    cpm: toNumber(get("cpm")),
    conversions: toInteger(get("conversions")),
    revenue: toNumber(get("revenue")),
    total_sales_attributed: toNumber(get("total_sales_attributed")),
    total_units_attributed: toInteger(get("total_units_attributed")),
    flight_start: toDate(get("flight_start")),
    flight_end: toDate(get("flight_end")),
    source_format: sourceFormat,
    extraction_confidence: mapping.confidence,
  };
}
