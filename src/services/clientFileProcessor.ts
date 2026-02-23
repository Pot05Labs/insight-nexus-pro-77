import * as XLSX from "xlsx";
import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist";
import { supabase } from "@/integrations/supabase/client";

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function norm(s: string): string {
  return s.trim().replace(/^["']|["']$/g, "").toLowerCase();
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[£$€,\s]/g, ""));
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
/*  Column aliases                                                    */
/* ------------------------------------------------------------------ */

const SELL_OUT_ALIASES: Record<string, string[]> = {
  date: ["date", "week", "period", "month", "day", "report_date", "sale_date", "transaction_date", "order_date", "invoice_date"],
  product_name_raw: ["product", "product_name", "product_name_raw", "item", "description", "product_description", "item_name", "title", "product_title", "item_description"],
  sku: ["sku", "sku_code", "ean", "barcode", "upc", "asin", "product_code", "item_code", "article", "article_code", "material", "material_code"],
  retailer: ["retailer", "channel", "store", "marketplace", "outlet", "account", "customer", "store_name", "account_name", "partner"],
  store_location: ["store_location", "location", "store_loc", "outlet_location"],
  region: ["region", "area", "territory", "geo", "geography", "market"],
  category: ["category", "product_category", "cat", "segment", "product_group"],
  brand: ["brand", "brand_name", "manufacturer"],
  sub_brand: ["sub_brand", "subbrand", "sub_brand_name", "variant"],
  format_size: ["format_size", "format", "size", "pack_size", "pack", "packaging"],
  revenue: ["revenue", "sales", "total_sales", "net_sales", "gross_sales", "sales_value", "ordered_value", "amount", "value", "turnover", "net_revenue", "gross_revenue", "total_value"],
  units_sold: ["units", "units_sold", "qty", "quantity", "volume", "units_ordered", "qty_sold", "sold_qty", "total_units"],
  units_supplied: ["units_supplied", "supplied", "supply_qty", "qty_supplied", "delivered", "units_delivered"],
  cost: ["cost", "cogs", "cost_of_goods", "unit_cost", "total_cost", "cost_value", "cost_price"],
};

const CAMPAIGN_ALIASES: Record<string, string[]> = {
  flight_start: ["date", "day", "report_date", "start_date", "flight_start", "campaign_date"],
  flight_end: ["end_date", "flight_end", "campaign_end"],
  platform: ["platform", "source", "network", "media", "media_channel", "ad_platform"],
  channel: ["channel", "media_type", "channel_type"],
  campaign_name: ["campaign", "campaign_name", "campaign_title", "name", "campaign_id"],
  spend: ["spend", "cost", "total_spend", "media_spend", "ad_spend", "amount_spent", "media_cost", "investment"],
  impressions: ["impressions", "impressions_paid", "imps", "views", "total_impressions"],
  clicks: ["clicks", "link_clicks", "total_clicks"],
  ctr: ["ctr", "click_through_rate", "click_rate"],
  conversions: ["conversions", "purchases", "orders", "actions", "results", "total_conversions"],
  revenue: ["revenue", "purchase_value", "conversion_value", "roas_value", "value", "sales_value", "attributed_revenue"],
  total_sales_attributed: ["total_sales_attributed", "attributed_sales", "sales_attributed"],
  total_units_attributed: ["total_units_attributed", "attributed_units", "units_attributed"],
};

const SELL_OUT_SIGNALS = [
  "units_sold", "units_supplied", "sales_value", "retailer", "sku_code",
  "product_name", "store", "store_name", "channel", "barcode", "ean",
  "upc", "asin", "cogs", "returns", "units_delivered", "sell_out",
  "qty_sold", "sold_qty", "gross_sales", "net_sales", "turnover",
  "store_location", "region", "category", "brand", "sub_brand", "format_size",
  "ordered_value", "units_ordered",
];

const CAMPAIGN_SIGNALS = [
  "impressions", "impressions_paid", "clicks", "spend", "ad_spend", "media_spend",
  "total_spend", "ctr", "cpm", "cpc", "roas", "campaign", "campaign_name",
  "ad_group", "adset", "ad_set", "platform", "conversions", "flight_start",
  "flight_end", "media_cost", "investment", "total_sales_attributed",
  "total_units_attributed",
];

function detectDataType(headers: string[]): "sell_out" | "campaign" {
  const normHeaders = headers.map(norm);
  let sellOutScore = 0;
  let campaignScore = 0;
  for (const h of normHeaders) {
    if (SELL_OUT_SIGNALS.some((s) => h === s || h.includes(s))) sellOutScore++;
    if (CAMPAIGN_SIGNALS.some((s) => h === s || h.includes(s))) campaignScore++;
  }
  return campaignScore > sellOutScore ? "campaign" : "sell_out";
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

/* ------------------------------------------------------------------ */
/*  File parsers — CSV, XLSX, PPTX, PDF                              */
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

function parseXLSXBuffer(buffer: ArrayBuffer): ParsedFileResult {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

async function parsePPTXBlob(blob: Blob): Promise<ParsedFileResult> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const allRows: string[][] = [];

  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)/i)?.[1] ?? "0");
      const nb = parseInt(b.match(/slide(\d+)/i)?.[1] ?? "0");
      return na - nb;
    });

  const domParser = new DOMParser();

  for (const slidePath of slideFiles) {
    const xml = await zip.files[slidePath].async("text");
    const doc = domParser.parseFromString(xml, "application/xml");

    const tables = doc.getElementsByTagName("a:tbl");
    for (let t = 0; t < tables.length; t++) {
      const tbl = tables[t];
      const trs = tbl.getElementsByTagName("a:tr");
      for (let r = 0; r < trs.length; r++) {
        const tr = trs[r];
        const tcs = tr.getElementsByTagName("a:tc");
        const cells: string[] = [];
        for (let c = 0; c < tcs.length; c++) {
          const textNodes = tcs[c].getElementsByTagName("a:t");
          const parts: string[] = [];
          for (let n = 0; n < textNodes.length; n++) {
            parts.push(textNodes[n].textContent?.trim() ?? "");
          }
          cells.push(parts.join(" ").trim());
        }
        if (cells.length > 0 && cells.some(c => c !== "")) allRows.push(cells);
      }
    }
  }

  if (allRows.length < 2) {
    throw new Error("No data tables found in this PowerPoint file. Tables in slides are required for data extraction.");
  }

  const headers = allRows[0];
  const dataRows = allRows.slice(1).map(row => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? null; });
    return obj;
  });
  return { headers, rows: dataRows };
}

/**
 * Parse a PDF file into tabular data.
 * Strategy:
 * 1. Extract all text content from every page
 * 2. Try to detect table structure from consistent line patterns
 * 3. Fall back to line-based text extraction
 */
async function parsePDFBlob(blob: Blob): Promise<ParsedFileResult> {
  const buffer = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

  const allLines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Group text items by Y position to reconstruct lines
    const itemsByY: Record<number, { x: number; text: string }[]> = {};
    for (const item of textContent.items) {
      if (!("str" in item)) continue;
      const y = Math.round((item as any).transform[5]);
      if (!itemsByY[y]) itemsByY[y] = [];
      itemsByY[y].push({ x: (item as any).transform[4], text: (item as any).str });
    }

    // Sort by Y descending (PDF coordinates are bottom-up), then X ascending
    const sortedYs = Object.keys(itemsByY).map(Number).sort((a, b) => b - a);
    for (const y of sortedYs) {
      const lineItems = itemsByY[y].sort((a, b) => a.x - b.x);
      const lineText = lineItems.map(i => i.text).join("\t").trim();
      if (lineText) allLines.push(lineText);
    }
  }

  if (allLines.length < 2) {
    throw new Error("No tabular data found in this PDF. The file needs structured data (tables) for import.");
  }

  // Detect the best separator: tab, |, or multiple spaces
  const firstLine = allLines[0];
  let separator: string | RegExp;
  if (firstLine.includes("\t")) {
    separator = "\t";
  } else if (firstLine.includes("|")) {
    separator = "|";
  } else {
    // Multiple spaces as separator
    separator = /\s{2,}/;
  }

  // Parse header row
  const headers = (typeof separator === "string"
    ? firstLine.split(separator)
    : firstLine.split(separator)
  ).map(h => h.trim()).filter(h => h.length > 0);

  if (headers.length < 2) {
    throw new Error("Could not detect column structure in PDF. Try converting to CSV or XLSX for better results.");
  }

  // Parse data rows
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < allLines.length; i++) {
    const cells = (typeof separator === "string"
      ? allLines[i].split(separator)
      : allLines[i].split(separator)
    ).map(c => c.trim());

    // Skip lines that don't roughly match the header count (likely sub-headers or footers)
    if (cells.length < Math.max(2, headers.length - 2) || cells.length > headers.length + 2) continue;

    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? null;
    });
    rows.push(obj);
  }

  if (rows.length === 0) {
    throw new Error("Extracted headers from PDF but no data rows matched the structure. Try CSV or XLSX instead.");
  }

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
    case "xlsx":
    case "xls": {
      const buffer = await file.arrayBuffer();
      return parseXLSXBuffer(buffer);
    }
    case "pptx": {
      return parsePPTXBlob(file);
    }
    case "pdf": {
      return parsePDFBlob(file);
    }
    default: {
      // Try XLSX first, then PPTX fallback for unknown Office files
      try {
        const buffer = await file.arrayBuffer();
        return parseXLSXBuffer(buffer);
      } catch {
        try {
          return await parsePPTXBlob(file);
        } catch {
          throw new Error(`Unsupported file format: .${ext}. Supported: CSV, XLSX, PPTX, PDF.`);
        }
      }
    }
  }
}

/**
 * Parse a Blob (e.g. from Supabase storage download) using filename to detect type.
 */
export async function parseBlobAsFile(blob: Blob, fileName: string): Promise<ParsedFileResult> {
  const file = new File([blob], fileName, { type: blob.type });
  return parseFile(file);
}

/**
 * Generate a preview (first 5 rows) for any supported file type.
 */
export async function generatePreview(file: File): Promise<{ columns: string[]; preview: string[][] }> {
  const { headers, rows } = await parseFile(file);
  const previewRows = rows.slice(0, 5).map(row =>
    headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      if (val instanceof Date) return val.toISOString().split("T")[0];
      return String(val);
    })
  );
  return { columns: headers, preview: previewRows };
}

/* ------------------------------------------------------------------ */
/*  Progress callback type                                            */
/* ------------------------------------------------------------------ */

export type ProcessingProgress = {
  stage: string;
  stageIndex: number;
  totalStages: number;
  rowsInserted: number;
  totalRows: number;
  percent: number;
};

/* ------------------------------------------------------------------ */
/*  Main client-side processor                                        */
/* ------------------------------------------------------------------ */

export async function processFileClientSide(
  file: File,
  uploadId: string,
  userId: string,
  sourceName: string | null,
  onProgress?: (p: ProcessingProgress) => void,
): Promise<{ rowsInserted: number; detectedType: string; fieldMap: Record<string, string> }> {
  const progress = (stage: string, stageIndex: number, rowsInserted: number, totalRows: number) => {
    onProgress?.({
      stage,
      stageIndex,
      totalStages: 5,
      rowsInserted,
      totalRows,
      percent: Math.round(((stageIndex + (totalRows > 0 ? rowsInserted / totalRows : 0)) / 5) * 100),
    });
  };

  // Stage 1: Parse file
  progress("Parsing file...", 0, 0, 0);
  const { headers, rows: jsonRows } = await parseFile(file);

  if (headers.length === 0 || jsonRows.length === 0) {
    await supabase.from("data_uploads").update({ status: "error", error_message: "No data found in file" }).eq("id", uploadId);
    throw new Error("No data found in file");
  }

  // Stage 2: Detect type & map columns
  progress("Classifying columns...", 1, 0, jsonRows.length);
  const detectedType = detectDataType(headers);
  const isCampaign = detectedType === "campaign";
  const aliases = isCampaign ? CAMPAIGN_ALIASES : SELL_OUT_ALIASES;
  const fieldMap = buildFieldMap(headers, aliases);

  // Get project
  const { data: proj } = await supabase.from("projects").select("id").limit(1).single();
  let projectId: string;
  if (!proj) {
    const { data: newProj, error: projErr } = await supabase
      .from("projects")
      .insert({ user_id: userId, name: "Default Project" })
      .select("id")
      .single();
    if (projErr || !newProj) {
      await supabase.from("data_uploads").update({ status: "error", error_message: "Could not create project" }).eq("id", uploadId);
      throw new Error("Could not create project");
    }
    projectId = newProj.id;
  } else {
    projectId = proj.id;
  }

  // Update upload record
  await supabase.from("data_uploads").update({
    column_names: headers,
    data_type: detectedType,
    column_mapping: fieldMap,
    source_type: isCampaign ? "ad_platform" : "retailer",
    status: "processing",
    project_id: projectId,
  }).eq("id", uploadId);

  const getField = (row: Record<string, unknown>, canonical: string): unknown => {
    const headerKey = fieldMap[canonical];
    return headerKey ? row[headerKey] : null;
  };

  // Stage 3: Insert data in batches
  progress("Inserting data...", 2, 0, jsonRows.length);
  const BATCH_SIZE = 500;
  let totalInserted = 0;

  for (let i = 0; i < jsonRows.length; i += BATCH_SIZE) {
    const batch = jsonRows.slice(i, i + BATCH_SIZE);

    if (isCampaign) {
      const records = batch.map((row) => ({
        user_id: userId,
        project_id: projectId,
        upload_id: uploadId,
        flight_start: parseDate(getField(row, "flight_start")) || null,
        flight_end: parseDate(getField(row, "flight_end")) || null,
        platform: getField(row, "platform") ? String(getField(row, "platform")) : null,
        channel: getField(row, "channel") ? String(getField(row, "channel")) : null,
        campaign_name: getField(row, "campaign_name") ? String(getField(row, "campaign_name")) : null,
        spend: num(getField(row, "spend")) ?? null,
        impressions: num(getField(row, "impressions")) ? Math.round(num(getField(row, "impressions"))!) : null,
        clicks: num(getField(row, "clicks")) ? Math.round(num(getField(row, "clicks"))!) : null,
        ctr: num(getField(row, "ctr")) ?? null,
        conversions: num(getField(row, "conversions")) ? Math.round(num(getField(row, "conversions"))!) : null,
        revenue: num(getField(row, "revenue")) ?? null,
        total_sales_attributed: num(getField(row, "total_sales_attributed")) ?? null,
        total_units_attributed: num(getField(row, "total_units_attributed")) ? Math.round(num(getField(row, "total_units_attributed"))!) : null,
      }));

      const { error } = await supabase.from("campaign_data_v2").insert(records);
      if (error) console.error("Campaign insert error:", error.message);
      else totalInserted += records.length;
    } else {
      const records = batch.map((row) => ({
        user_id: userId,
        project_id: projectId,
        upload_id: uploadId,
        date: parseDate(getField(row, "date")) || null,
        product_name_raw: getField(row, "product_name_raw") ? String(getField(row, "product_name_raw")) : null,
        sku: getField(row, "sku") ? String(getField(row, "sku")) : null,
        retailer: getField(row, "retailer") ? String(getField(row, "retailer")) : (sourceName || null),
        store_location: getField(row, "store_location") ? String(getField(row, "store_location")) : null,
        region: getField(row, "region") ? String(getField(row, "region")) : null,
        category: getField(row, "category") ? String(getField(row, "category")) : null,
        brand: getField(row, "brand") ? String(getField(row, "brand")) : null,
        sub_brand: getField(row, "sub_brand") ? String(getField(row, "sub_brand")) : null,
        format_size: getField(row, "format_size") ? String(getField(row, "format_size")) : null,
        revenue: num(getField(row, "revenue")) ?? null,
        units_sold: num(getField(row, "units_sold")) ? Math.round(num(getField(row, "units_sold"))!) : null,
        units_supplied: num(getField(row, "units_supplied")) ?? null,
        cost: num(getField(row, "cost")) ?? null,
      }));

      const { error } = await supabase.from("sell_out_data").insert(records);
      if (error) console.error("Sell-out insert error:", error.message);
      else totalInserted += records.length;
    }

    progress("Inserting data...", 2, totalInserted, jsonRows.length);
    await new Promise((r) => setTimeout(r, 50));
  }

  // Stage 4: Compute metrics
  progress("Computing metrics...", 3, totalInserted, jsonRows.length);

  if (!isCampaign && totalInserted > 0) {
    const { data: soData } = await supabase
      .from("sell_out_data")
      .select("revenue, units_sold, units_supplied, sku, retailer")
      .eq("upload_id", uploadId);
    if (soData && soData.length > 0) {
      const totalRevenue = soData.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
      const totalUnits = soData.reduce((s, r) => s + Number(r.units_sold ?? 0), 0);
      const totalSupplied = soData.reduce((s, r) => s + Number(r.units_supplied ?? 0), 0);
      const uniqueSkus = new Set(soData.map((r) => r.sku).filter(Boolean)).size;
      const uniqueRetailers = new Set(soData.map((r) => r.retailer).filter(Boolean)).size;
      const fillRate = totalUnits > 0 ? totalSupplied / totalUnits : 0;
      await supabase.from("computed_metrics").insert({
        user_id: userId, project_id: projectId, metric_name: "sell_out_summary", metric_value: null,
        dimensions: { total_revenue: totalRevenue, total_units: totalUnits, unique_skus: uniqueSkus, unique_retailers: uniqueRetailers, fill_rate: Math.round(fillRate * 10000) / 10000 },
      });
    }
  }

  if (isCampaign && totalInserted > 0) {
    const { data: cpData } = await supabase
      .from("campaign_data_v2")
      .select("spend, impressions, clicks, ctr, conversions, total_sales_attributed, total_units_attributed")
      .eq("upload_id", uploadId);
    if (cpData && cpData.length > 0) {
      const totalSpend = cpData.reduce((s, r) => s + Number(r.spend ?? 0), 0);
      const totalImpressions = cpData.reduce((s, r) => s + Number(r.impressions ?? 0), 0);
      const totalClicks = cpData.reduce((s, r) => s + Number(r.clicks ?? 0), 0);
      const totalConversions = cpData.reduce((s, r) => s + Number(r.conversions ?? 0), 0);
      const totalSalesAttributed = cpData.reduce((s, r) => s + Number(r.total_sales_attributed ?? 0), 0);
      const totalUnitsAttributed = cpData.reduce((s, r) => s + Number(r.total_units_attributed ?? 0), 0);
      const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
      const roas = totalSpend > 0 ? totalSalesAttributed / totalSpend : 0;
      const cps = totalUnitsAttributed > 0 ? totalSpend / totalUnitsAttributed : 0;
      await supabase.from("computed_metrics").insert({
        user_id: userId, project_id: projectId, metric_name: "campaign_summary", metric_value: null,
        dimensions: { total_spend: Math.round(totalSpend * 100) / 100, total_impressions: totalImpressions, total_clicks: totalClicks, avg_ctr: Math.round(avgCTR * 100) / 100, avg_cpc: Math.round(avgCPC * 100) / 100, roas: Math.round(roas * 100) / 100, cps: Math.round(cps * 100) / 100, total_conversions: totalConversions },
      });
    }
  }

  // Stage 5: Finalize
  progress("Done!", 4, totalInserted, jsonRows.length);

  await supabase.from("data_uploads").update({
    status: totalInserted > 0 ? "ready" : "error",
    row_count: totalInserted,
    error_message: totalInserted === 0 ? "No rows could be parsed. Check column headers." : null,
  }).eq("id", uploadId);

  return { rowsInserted: totalInserted, detectedType, fieldMap };
}

/* ------------------------------------------------------------------ */
/*  Retry: download from storage and reprocess                        */
/* ------------------------------------------------------------------ */

export async function reprocessFromStorage(
  uploadId: string,
  storagePath: string,
  fileName: string,
  userId: string,
  sourceName: string | null,
  onProgress?: (p: ProcessingProgress) => void,
): Promise<{ rowsInserted: number; detectedType: string; fieldMap: Record<string, string> }> {
  const { data: blob, error: dlErr } = await supabase.storage.from("uploads").download(storagePath);
  if (dlErr || !blob) throw new Error("Failed to download file from storage: " + (dlErr?.message ?? "unknown"));

  await Promise.all([
    supabase.from("sell_out_data").delete().eq("upload_id", uploadId),
    supabase.from("campaign_data_v2").delete().eq("upload_id", uploadId),
    supabase.from("computed_metrics").delete().eq("user_id", userId),
  ]);

  const file = new File([blob], fileName, { type: blob.type });
  return processFileClientSide(file, uploadId, userId, sourceName, onProgress);
}
