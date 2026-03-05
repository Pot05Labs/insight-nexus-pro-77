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

  // ISO format YYYY-MM-DD (unambiguous — parse via regex, not new Date())
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    const d2 = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
    if (!isNaN(d2.getTime())) {
      const year = d2.getFullYear();
      if (year >= 1990 && year <= 2040) {
        return d2.toISOString().split("T")[0];
      }
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY (South African priority — MUST run before new Date())
  // new Date("01/03/2024") interprets as MM/DD (Jan 3) in V8, but SA means DD/MM (1 Mar).
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    let [, first, second, yyyy] = dmyMatch;
    let day = parseInt(first);
    let month = parseInt(second);

    // Disambiguate: if first > 12, it MUST be a day (DD/MM format).
    // If second > 12, it MUST be a month error — swap to treat as MM/DD.
    // If both <= 12, prefer DD/MM for South African context.
    if (day <= 12 && month > 12) {
      // First number fits as month, second doesn't — this is MM/DD
      [day, month] = [month, day];
    }
    // else: day > 12 means it's definitely DD/MM (correct as-is)
    // else: both <= 12 — assume DD/MM (SA default)

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d2 = new Date(parseInt(yyyy), month - 1, day);
      if (!isNaN(d2.getTime()) && d2.getDate() === day) {
        return d2.toISOString().split("T")[0];
      }
    }
  }

  // DD/MM/YY (2-digit year, common in SA retail exports)
  const dmyShortMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (dmyShortMatch) {
    let [, first, second, yy] = dmyShortMatch;
    let day = parseInt(first);
    let month = parseInt(second);

    // Same disambiguation as 4-digit year
    if (day <= 12 && month > 12) {
      [day, month] = [month, day];
    }

    // Century inference: 00-49 → 2000s, 50-99 → 1900s
    const shortYear = parseInt(yy);
    const fullYear = shortYear < 50 ? 2000 + shortYear : 1900 + shortYear;

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d2 = new Date(fullYear, month - 1, day);
      if (!isNaN(d2.getTime()) && d2.getDate() === day) {
        return d2.toISOString().split("T")[0];
      }
    }
  }

  // Named month formats ("1 Mar 2024", "March 1, 2024", etc.) — safe for new Date()
  // Also handles YYYY/MM/DD and other unambiguous formats.
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    if (year >= 1990 && year <= 2040) {
      return d.toISOString().split("T")[0];
    }
  }

  // Could not parse
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
import { resolveProvince } from "@/lib/sa-store-provinces";

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
  // A file may have both "Ordered Value" and "Merchandise Sales".
  // Merchandise Sales = what was actually sold. Ordered Value includes unfulfilled orders.
  const actualRevenue = toNumber(get("actual_revenue"));
  const orderedRevenue = toNumber(get("revenue"));

  // Units priority: units_supplied (actually delivered/sold) > units_sold (may be ordered qty)
  // A file may have both "Ordered Qty" and "Supplied Qty".
  // Supplied Qty = what was actually delivered to shelves. Ordered Qty includes unfulfilled orders.
  const unitsSold = toInteger(get("units_sold"));
  const unitsSupplied = toInteger(get("units_supplied"));

  // Store only canonical provinces. If the upload's region column contains
  // a store name or malformed geography, fall back to store inference.
  const explicitRegion = toText(get("region"));
  const storeLocation = toText(get("store_location"));
  const region = resolveProvince({ region: explicitRegion, storeLocation });

  return {
    user_id: userId,
    project_id: projectId,
    upload_id: uploadId,
    date: toDate(get("date")),
    product_name_raw: toText(get("product_name_raw")),
    sku: toText(get("sku")),
    retailer: toText(get("retailer")) || sourceName || null,
    store_location: storeLocation,
    region,
    category: toText(get("category")),
    brand: toText(get("brand")),
    sub_brand: toText(get("sub_brand")),
    format_size: toText(get("format_size")),
    revenue: actualRevenue ?? orderedRevenue,      // prefer merchandise sales over ordered value
    units_sold: unitsSupplied ?? unitsSold,         // prefer supplied/delivered qty over ordered qty
    units_supplied: unitsSupplied,
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
