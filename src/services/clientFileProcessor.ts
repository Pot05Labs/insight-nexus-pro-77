// Dynamic import — xlsx (~151KB) is only loaded when a spreadsheet is actually parsed
import type { ParsingOptions } from "xlsx";
let _xlsxModule: typeof import("xlsx") | null = null;
async function getXLSX() {
  if (!_xlsxModule) _xlsxModule = await import("xlsx");
  return _xlsxModule;
}
import { supabase } from "@/integrations/supabase/client";
import {
  SELL_OUT_SCHEMA,
  CAMPAIGN_SCHEMA,
  buildSchemaReport,
  type SchemaReport,
} from "@/lib/canonical-schemas";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function norm(s: string): string {
  return s.trim().replace(/^["']|["']$/g, "").toLowerCase();
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  // Strip currency symbols (including ZAR "R" prefix), commas, spaces
  let s = String(v).trim();
  // Handle "R100,000" or "R 100 000" — strip leading R only when followed by digits/space
  s = s.replace(/^R\s*/i, "");
  const n = Number(s.replace(/[£$€,\s]/g, ""));
  return isNaN(n) ? null : n;
}

function parseDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{5}$/.test(s)) {
    const excelEpoch = new Date(1899, 11, 30);
    const d = new Date(excelEpoch.getTime() + Number(s) * 86400000);
    return d.toISOString().split("T")[0];
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

/* ------------------------------------------------------------------ */
/*  Column aliases — derived from canonical schemas                    */
/* ------------------------------------------------------------------ */

function aliasesFromSchema(schema: Record<string, { aliases: string[] }>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, field] of Object.entries(schema)) {
    out[key] = field.aliases;
  }
  return out;
}

const SELL_OUT_ALIASES: Record<string, string[]> = aliasesFromSchema(SELL_OUT_SCHEMA);
const CAMPAIGN_ALIASES: Record<string, string[]> = aliasesFromSchema(CAMPAIGN_SCHEMA);

const SELL_OUT_SIGNALS = [
  "units_sold", "units_supplied", "sales_value", "retailer", "sku_code",
  "product_name", "sku_name", "store", "store_name", "channel", "barcode", "ean",
  "upc", "asin", "cogs", "returns", "units_delivered", "sell_out",
  "qty_sold", "sold_qty", "gross_sales", "net_sales", "turnover",
  "store_location", "region", "category", "brand", "sub_brand", "format_size",
  "ordered_value", "units_ordered", "ordered_qty", "supplied_qty",
  "vendor", "date_delivery", "delivery_date", "merchandise_sales",
  "subs_product", "subs_sku", "mainorderid", "province", "department",
  "items_sold",
];

const CAMPAIGN_SIGNALS = [
  "impressions", "impressions_paid", "clicks", "spend", "ad_spend", "media_spend",
  "total_spend", "ctr", "cpm", "cpc", "roas", "campaign", "campaign_name",
  "ad_group", "adset", "ad_set", "platform", "conversions", "flight_start",
  "flight_end", "media_cost", "investment", "total_sales_attributed",
  "total_units_attributed",
];

export type DetectedTypes = { sell_out: boolean; campaign: boolean };

function detectDataTypes(headers: string[]): DetectedTypes {
  const normHeaders = headers.map(norm);
  let sellOutScore = 0;
  let campaignScore = 0;
  for (const h of normHeaders) {
    if (SELL_OUT_SIGNALS.some((s) => h === s || h.includes(s))) sellOutScore++;
    if (CAMPAIGN_SIGNALS.some((s) => h === s || h.includes(s))) campaignScore++;
  }
  // If both score >= 3, it's a mixed file
  if (sellOutScore >= 3 && campaignScore >= 3) return { sell_out: true, campaign: true };
  if (campaignScore > sellOutScore) return { sell_out: false, campaign: true };
  return { sell_out: true, campaign: false };
}

/** Legacy single-type detection for backward compat */
function detectDataType(headers: string[]): "sell_out" | "campaign" {
  const types = detectDataTypes(headers);
  if (types.campaign && !types.sell_out) return "campaign";
  return "sell_out";
}

function buildFieldMap(headers: string[], aliases: Record<string, string[]>): Record<string, string> {
  const map: Record<string, string> = {};
  const normHeaders = headers.map(norm);
  for (const [canonical, alts] of Object.entries(aliases)) {
    for (const alt of alts) {
      const idx = normHeaders.indexOf(alt);
      if (idx !== -1) { map[canonical] = headers[idx]; break; }
    }
    if (!map[canonical]) {
      for (const alt of alts) {
        const idx = normHeaders.findIndex((h) => h.includes(alt) || alt.includes(h));
        if (idx !== -1) { map[canonical] = headers[idx]; break; }
      }
    }
  }
  return map;
}

/** Build a schema report for a parsed file */
export function buildFileSchemaReport(
  headers: string[],
  rows: Record<string, unknown>[],
): SchemaReport {
  // Special case: PPTX/PDF files return a ["Note"] stub header — show AI extraction message
  if (headers.length === 1 && headers[0] === "Note") {
    return {
      dataType: "campaign",
      mapped: [],
      unmapped: [],
      unmappedSource: [],
      confidence: -1,  // -1 signals "AI extraction" — display layer handles this
    };
  }

  const types = detectDataTypes(headers);
  const isMixed = types.sell_out && types.campaign;
  const isCampaign = types.campaign && !types.sell_out;

  if (isMixed) {
    // Report against both schemas combined
    const soMap = buildFieldMap(headers, SELL_OUT_ALIASES);
    const cpMap = buildFieldMap(headers, CAMPAIGN_ALIASES);
    const combined = { ...soMap, ...cpMap };
    const combinedSchema = { ...SELL_OUT_SCHEMA, ...CAMPAIGN_SCHEMA };
    return buildSchemaReport(headers, rows, combined, combinedSchema, "mixed");
  }

  const schema = isCampaign ? CAMPAIGN_SCHEMA : SELL_OUT_SCHEMA;
  const aliases = isCampaign ? CAMPAIGN_ALIASES : SELL_OUT_ALIASES;
  const fieldMap = buildFieldMap(headers, aliases);
  const dataType = isCampaign ? "campaign" : "sell_out";
  return buildSchemaReport(headers, rows, fieldMap, schema, dataType);
}

/* ------------------------------------------------------------------ */
/*  File parsers — CSV, XLSX                                          */
/* ------------------------------------------------------------------ */

export type ParsedFileResult = { headers: string[]; rows: Record<string, unknown>[] };

function parseCSVText(text: string): ParsedFileResult {
  const lines = text.split("\n").filter((l) => l.trim());
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const rows = lines.slice(1).map((l) => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of l) {
      if (char === '"') { inQuotes = !inQuotes; continue; }
      if (char === "," && !inQuotes) { values.push(current.trim()); current = ""; continue; }
      current += char;
    }
    values.push(current.trim());
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? null; });
    return obj;
  });
  return { headers, rows };
}

async function parseXLSXBuffer(buffer: ArrayBuffer, maxRows?: number): Promise<ParsedFileResult> {
  const XLSX = await getXLSX();
  // Use sheetRows to limit memory when only a preview is needed
  const opts: ParsingOptions = { type: "array", cellDates: true };
  if (maxRows) opts.sheetRows = maxRows + 1; // +1 for header row
  const workbook = XLSX.read(new Uint8Array(buffer), opts);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

/* ------------------------------------------------------------------ */
/*  Additional parsers — TSV                                          */
/* ------------------------------------------------------------------ */

function parseDelimitedText(text: string, forceSep?: string): ParsedFileResult {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) throw new Error("File has no data rows.");

  // Auto-detect separator from first line
  const firstLine = lines[0];
  let sep = forceSep ?? ",";
  if (!forceSep) {
    const tabCount = (firstLine.match(/\t/g) ?? []).length;
    const commaCount = (firstLine.match(/,/g) ?? []).length;
    const semiCount = (firstLine.match(/;/g) ?? []).length;
    const pipeCount = (firstLine.match(/\|/g) ?? []).length;
    const max = Math.max(tabCount, commaCount, semiCount, pipeCount);
    if (max === tabCount && tabCount > 0) sep = "\t";
    else if (max === semiCount && semiCount > 0) sep = ";";
    else if (max === pipeCount && pipeCount > 0) sep = "|";
    else sep = ",";
  }

  const headers = firstLine.split(sep).map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const rows = lines.slice(1).map((l) => {
    const values = l.split(sep).map((v) => v.trim().replace(/^["']|["']$/g, ""));
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? null; });
    return obj;
  });
  return { headers, rows };
}

/* ------------------------------------------------------------------ */
/*  Unified file parser                                               */
/* ------------------------------------------------------------------ */

export function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export async function parseFile(file: File): Promise<ParsedFileResult> {
  const ext = getFileExtension(file.name);

  switch (ext) {
    case "csv": {
      const text = await file.text();
      return parseCSVText(text);
    }
    case "tsv":
    case "tab": {
      const text = await file.text();
      return parseDelimitedText(text, "\t");
    }
    case "txt": {
      const text = await file.text();
      return parseDelimitedText(text); // auto-detect delimiter
    }
    case "xlsx":
    case "xls": {
      const buffer = await file.arrayBuffer();
      // Only read first 20 rows for preview — full parse happens in uploadOrchestrator
      return await parseXLSXBuffer(buffer, 20);
    }
    case "pptx":
      return {
        headers: ["Note"],
        rows: [{ Note: "PPTX files are parsed by AI after upload. Campaign metrics (spend, impressions, CTR, etc.) will be automatically extracted from slides." }],
      };
    case "pdf":
    case "json":
    case "xml":
      return {
        headers: ["Note"],
        rows: [{ Note: `${ext.toUpperCase()} files are parsed on the server after upload.` }],
      };
    default:
      return {
        headers: ["Note"],
        rows: [{ Note: `File will be parsed on the server after upload.` }],
      };
  }
}

/**
 * Generate a preview (first 5 rows) + schema report for any supported file type.
 */
export async function generatePreview(file: File): Promise<{ columns: string[]; preview: string[][]; schemaReport: SchemaReport }> {
  const { headers, rows } = await parseFile(file);
  const previewRows = rows.slice(0, 5).map(row =>
    headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      if (val instanceof Date) return val.toISOString().split("T")[0];
      return String(val);
    })
  );
  // Only pass first 20 rows to schema report — enough for column detection, avoids holding all data
  const schemaReport = buildFileSchemaReport(headers, rows.slice(0, 20));
  return { columns: headers, preview: previewRows, schemaReport };
}
