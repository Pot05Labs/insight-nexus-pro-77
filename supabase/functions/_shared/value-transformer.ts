/* ------------------------------------------------------------------ */
/*  Value Transformer — Deno-compatible version for Edge Functions      */
/*  Deterministic value conversion: numbers, dates, strings            */
/*  Mirrors src/services/valueTransformer.ts for server-side use       */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Number conversion                                                  */
/* ------------------------------------------------------------------ */

/**
 * Convert a raw string to a number.
 * Handles: "R200,000" -> 200000, "4.02%" -> 4.02, "2.52x" -> 2.52,
 *          "(500)" -> -500, "200 000" -> 200000
 * Returns null if the value cannot be parsed.
 */
export function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;

  let s = String(raw).trim();

  // Strip ZAR "R" prefix (handles "R200,000" and "R 200 000")
  s = s.replace(/^R\s*/i, "");

  // Strip percentage suffix
  s = s.replace(/%\s*$/, "");

  // Strip multiplier suffix (ROAS "2.52x")
  s = s.replace(/x\s*$/i, "");

  // Strip currency symbols
  s = s.replace(/[£$€]/g, "");

  // Remove commas and spaces (thousand separators)
  s = s.replace(/,/g, "");
  s = s.replace(/\s/g, "");

  // Handle parenthetical negatives: (500) -> -500
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
export function toInteger(raw: unknown): number | null {
  const n = toNumber(raw);
  return n !== null ? Math.round(n) : null;
}

/* ------------------------------------------------------------------ */
/*  Date conversion                                                    */
/* ------------------------------------------------------------------ */

/**
 * Convert a raw string to ISO date (YYYY-MM-DD).
 * Handles: Excel serial numbers, ISO format, DD/MM/YYYY (SA priority),
 *          DD/MM/YY (2-digit year), named months.
 */
export function toDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;

  const s = String(raw).trim();

  // Excel serial number (e.g., "45678" or "45678.5")
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

  // ISO format YYYY-MM-DD (unambiguous -- parse via regex, not new Date())
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

  // DD/MM/YYYY or DD-MM-YYYY (South African priority -- MUST run before new Date())
  // new Date("01/03/2024") interprets as MM/DD (Jan 3) in V8, but SA means DD/MM (1 Mar).
  const dmyMatch = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (dmyMatch) {
    const [, first, second, yyyy] = dmyMatch;
    let day = parseInt(first);
    let month = parseInt(second);

    // Disambiguate: if first > 12, it MUST be a day (DD/MM format).
    // If second > 12, it MUST be a month error -- swap to treat as MM/DD.
    // If both <= 12, prefer DD/MM for South African context.
    if (day <= 12 && month > 12) {
      [day, month] = [month, day];
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d2 = new Date(parseInt(yyyy), month - 1, day);
      if (!isNaN(d2.getTime()) && d2.getDate() === day) {
        return d2.toISOString().split("T")[0];
      }
    }
  }

  // DD/MM/YY (2-digit year, common in SA retail exports)
  const dmyShortMatch = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2})$/);
  if (dmyShortMatch) {
    const [, first, second, yy] = dmyShortMatch;
    let day = parseInt(first);
    let month = parseInt(second);

    if (day <= 12 && month > 12) {
      [day, month] = [month, day];
    }

    // Century inference: 00-49 -> 2000s, 50-99 -> 1900s
    const shortYear = parseInt(yy);
    const fullYear = shortYear < 50 ? 2000 + shortYear : 1900 + shortYear;

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d2 = new Date(fullYear, month - 1, day);
      if (!isNaN(d2.getTime()) && d2.getDate() === day) {
        return d2.toISOString().split("T")[0];
      }
    }
  }

  // Named month formats ("1 Mar 2024", "March 1, 2024", etc.)
  // Also handles YYYY/MM/DD and other unambiguous formats.
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    if (year >= 1990 && year <= 2040) {
      return d.toISOString().split("T")[0];
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  String conversion                                                  */
/* ------------------------------------------------------------------ */

/**
 * Clean a string value for database insert.
 * Trims whitespace, returns null for empty strings.
 */
export function toText(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

/* ------------------------------------------------------------------ */
/*  Row transformers                                                   */
/* ------------------------------------------------------------------ */

import { resolveProvince } from "./sa-provinces.ts";

/**
 * Transform a raw parsed row into a sell_out_data insert record.
 * Uses the field map to find source values, then converts types.
 */
export function toSellOutRecord(
  row: Record<string, unknown>,
  fieldMap: Record<string, string>,
  uploadId: string,
  userId: string,
  projectId: string,
  sourceName: string | null,
): Record<string, unknown> {
  const get = (canonical: string): unknown => {
    const sourceCol = fieldMap[canonical];
    return sourceCol ? (row[sourceCol] ?? null) : null;
  };

  // Revenue priority: actual_revenue (merchandise sales) > revenue (ordered value)
  const actualRevenue = toNumber(get("actual_revenue"));
  const orderedRevenue = toNumber(get("revenue"));

  // Units priority: units_supplied (actually delivered) > units_sold (may be ordered qty)
  const unitsSold = toInteger(get("units_sold"));
  const unitsSupplied = toInteger(get("units_supplied"));

  // Province inference: explicit region > inferred from store location
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
    revenue: actualRevenue ?? orderedRevenue,
    units_sold: unitsSupplied ?? unitsSold,
    units_supplied: unitsSupplied,
    cost: toNumber(get("cost")),
  };
}

/**
 * Transform a raw parsed row into a campaign_data_v2 insert record.
 */
export function toCampaignRecord(
  row: Record<string, unknown>,
  fieldMap: Record<string, string>,
  uploadId: string,
  userId: string,
  projectId: string,
  sourceFormat: string,
  extractionConfidence: number,
): Record<string, unknown> {
  const get = (canonical: string): unknown => {
    const sourceCol = fieldMap[canonical];
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
    extraction_confidence: extractionConfidence,
  };
}
