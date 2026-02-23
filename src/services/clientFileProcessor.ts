import * as XLSX from "xlsx";
import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist";
import { supabase } from "@/integrations/supabase/client";
import {
  SELL_OUT_SCHEMA,
  CAMPAIGN_SCHEMA,
  buildSchemaReport,
  type SchemaReport,
} from "@/lib/canonical-schemas";

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
  "product_name", "store", "store_name", "channel", "barcode", "ean",
  "upc", "asin", "cogs", "returns", "units_delivered", "sell_out",
  "qty_sold", "sold_qty", "gross_sales", "net_sales", "turnover",
  "store_location", "region", "category", "brand", "sub_brand", "format_size",
  "ordered_value", "units_ordered", "ordered_qty", "supplied_qty",
  "vendor", "date_delivery", "delivery_date", "merchandise_sales",
  "subs_product", "subs_sku", "mainorderid", "province", "department",
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
  const domParser = new DOMParser();

  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)/i)?.[1] ?? "0");
      const nb = parseInt(b.match(/slide(\d+)/i)?.[1] ?? "0");
      return na - nb;
    });

  // ── Strategy 1: Extract <a:tbl> table elements ──
  const tableRows: string[][] = [];
  for (const slidePath of slideFiles) {
    const xml = await zip.files[slidePath].async("text");
    const doc = domParser.parseFromString(xml, "application/xml");
    const tables = doc.getElementsByTagName("a:tbl");
    for (let t = 0; t < tables.length; t++) {
      const trs = tables[t].getElementsByTagName("a:tr");
      for (let r = 0; r < trs.length; r++) {
        const tcs = trs[r].getElementsByTagName("a:tc");
        const cells: string[] = [];
        for (let c = 0; c < tcs.length; c++) {
          const textNodes = tcs[c].getElementsByTagName("a:t");
          const parts: string[] = [];
          for (let n = 0; n < textNodes.length; n++) parts.push(textNodes[n].textContent?.trim() ?? "");
          cells.push(parts.join(" ").trim());
        }
        if (cells.length > 0 && cells.some(c => c !== "")) tableRows.push(cells);
      }
    }
  }

  if (tableRows.length >= 2) {
    return rowsToResult(tableRows);
  }

  // ── Strategy 2: Extract chart data from ppt/charts/*.xml ──
  const chartFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/charts\/chart\d*\.xml$/i.test(name))
    .sort();

  for (const chartPath of chartFiles) {
    const xml = await zip.files[chartPath].async("text");
    const doc = domParser.parseFromString(xml, "application/xml");
    const result = extractChartData(doc);
    if (result && result.headers.length >= 2 && result.rows.length >= 1) {
      return result;
    }
  }

  // ── Strategy 3: Extract embedded Excel spreadsheets ──
  const embeddedXlsx = Object.keys(zip.files)
    .filter(name => /\.(xlsx|xls)$/i.test(name));
  for (const xlsxPath of embeddedXlsx) {
    try {
      const buffer = await zip.files[xlsxPath].async("arraybuffer");
      const result = parseXLSXBuffer(buffer);
      if (result.headers.length >= 2 && result.rows.length >= 1) return result;
    } catch { /* skip corrupt embeds */ }
  }

  // ── Strategy 4: Key-Value pair extraction from text boxes ──
  // Handles campaign PCA reports where data is "Metric: Value" in text shapes
  const kvResult = await extractKeyValueDataAsync(zip, slideFiles, domParser);
  if (kvResult && kvResult.headers.length >= 2 && kvResult.rows.length >= 1) {
    return kvResult;
  }

  // ── Strategy 5: Extract all text from shapes, group by position ──
  const shapeResult = await extractTextFromShapes(zip, slideFiles, domParser);
  if (shapeResult && shapeResult.headers.length >= 2 && shapeResult.rows.length >= 1) {
    return shapeResult;
  }

  // ── Strategy 6: Flat text extraction (all text from all slides, line by line) ──
  const allText: string[] = [];
  for (const slidePath of slideFiles) {
    const xml = await zip.files[slidePath].async("text");
    const doc = domParser.parseFromString(xml, "application/xml");
    const textNodes = doc.getElementsByTagName("a:t");
    const slideTexts: string[] = [];
    for (let i = 0; i < textNodes.length; i++) {
      const t = textNodes[i].textContent?.trim();
      if (t) slideTexts.push(t);
    }
    if (slideTexts.length > 0) allText.push(slideTexts.join("\t"));
  }

  if (allText.length >= 2) {
    return parseDelimitedLines(allText);
  }

  throw new Error(
    "Could not extract structured data from this PowerPoint file. " +
    "The file may contain only images, charts without data, or free-form text. " +
    "Try exporting the data as CSV or XLSX for best results."
  );
}

/** Convert raw row arrays (first row = headers) into ParsedFileResult */
function rowsToResult(allRows: string[][]): ParsedFileResult {
  const headers = allRows[0];
  const dataRows = allRows.slice(1).map(row => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? null; });
    return obj;
  });
  return { headers, rows: dataRows };
}

/** Extract data series from OOXML chart XML */
function extractChartData(doc: Document): ParsedFileResult | null {
  // Try plotArea → series extraction
  const series = doc.getElementsByTagName("c:ser");
  if (series.length === 0) return null;

  // Collect category labels (X axis)
  let categories: string[] = [];
  const catRefs = doc.getElementsByTagName("c:cat");
  if (catRefs.length > 0) {
    const strCache = catRefs[0].getElementsByTagName("c:strCache")[0]
      ?? catRefs[0].getElementsByTagName("c:numCache")[0];
    if (strCache) {
      const pts = strCache.getElementsByTagName("c:pt");
      categories = Array.from({ length: pts.length }, (_, i) => {
        const v = pts[i]?.getElementsByTagName("c:v")[0]?.textContent?.trim();
        return v ?? `Item ${i + 1}`;
      });
    }
  }

  if (categories.length === 0) return null;

  // Collect each series' name and values
  const seriesData: { name: string; values: string[] }[] = [];
  for (let s = 0; s < series.length; s++) {
    const ser = series[s];
    // Series name
    const txEl = ser.getElementsByTagName("c:tx")[0];
    let serName = `Series ${s + 1}`;
    if (txEl) {
      const strRef = txEl.getElementsByTagName("c:strCache")[0];
      if (strRef) {
        const v = strRef.getElementsByTagName("c:v")[0]?.textContent?.trim();
        if (v) serName = v;
      }
      const vEl = txEl.getElementsByTagName("c:v")[0];
      if (vEl?.textContent?.trim()) serName = vEl.textContent.trim();
    }

    // Series values
    const valRefs = ser.getElementsByTagName("c:val")[0]
      ?? ser.getElementsByTagName("c:yVal")[0];
    const values: string[] = [];
    if (valRefs) {
      const numCache = valRefs.getElementsByTagName("c:numCache")[0];
      if (numCache) {
        const pts = numCache.getElementsByTagName("c:pt");
        for (let p = 0; p < pts.length; p++) {
          values.push(pts[p].getElementsByTagName("c:v")[0]?.textContent?.trim() ?? "");
        }
      }
    }
    seriesData.push({ name: serName, values });
  }

  if (seriesData.length === 0) return null;

  // Build tabular result: first column = categories, then one column per series
  const headers = ["Category", ...seriesData.map(s => s.name)];
  const rows: Record<string, unknown>[] = categories.map((cat, i) => {
    const obj: Record<string, unknown> = { Category: cat };
    seriesData.forEach(s => { obj[s.name] = s.values[i] ?? null; });
    return obj;
  });

  return { headers, rows };
}

/* ------------------------------------------------------------------ */
/*  Key-Value Pair extraction for campaign PCA decks                   */
/* ------------------------------------------------------------------ */

// Known metric aliases → canonical column names (campaign-focused)
const KV_METRIC_MAP: Record<string, string> = {
  // Spend
  "spend": "spend", "media spend": "spend", "ad spend": "spend", "total spend": "spend",
  "budget": "spend", "investment": "spend", "media cost": "spend", "cost": "spend",
  // Impressions
  "impressions": "impressions", "imps": "impressions", "total impressions": "impressions",
  // Clicks
  "clicks": "clicks", "link clicks": "clicks", "total clicks": "clicks",
  // CTR
  "ctr": "ctr", "click through rate": "ctr", "click-through rate": "ctr",
  // CPM
  "cpm": "cpm", "cost per mille": "cpm", "cost per 1000": "cpm",
  // CPC
  "cpc": "cpc", "cost per click": "cpc",
  // Sales / Revenue
  "sales": "revenue", "revenue": "revenue", "total sales": "revenue",
  "sales value": "revenue", "total revenue": "revenue", "purchase value": "revenue",
  "attributed revenue": "revenue", "attributed sales": "revenue",
  // Orders / Conversions
  "orders": "conversions", "conversions": "conversions", "purchases": "conversions",
  "total orders": "conversions", "total conversions": "conversions",
  // Units
  "units": "units_sold", "units sold": "units_sold", "total units": "units_sold",
  "quantity": "units_sold", "qty": "units_sold",
  // AOV
  "aov": "aov", "average order value": "aov", "avg order value": "aov",
  // ROAS
  "roas": "roas", "return on ad spend": "roas",
  // Reach
  "reach": "reach", "total reach": "reach",
  // Frequency
  "frequency": "frequency", "avg frequency": "frequency",
  // Engagement
  "engagements": "engagements", "engagement rate": "engagement_rate",
  // Video
  "video views": "video_views", "views": "video_views",
  "view rate": "view_rate", "vtr": "view_rate",
  // CPO / CPS
  "cpo": "cpo", "cost per order": "cpo",
  "cps": "cps", "cost per sale": "cps",
};

// Month names for period detection
const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

const QUARTER_RE = /^q[1-4]\s*\d{2,4}$/i;
const WEEK_RE = /^week\s*\d+/i;
const DATE_RANGE_RE = /^\d{1,2}[\s/-]\w+[\s/-]\d{2,4}\s*([-–—to]+)\s*\d{1,2}[\s/-]\w+[\s/-]\d{2,4}$/i;

/**
 * Extract key-value pair data from text boxes in PPTX slides.
 * Handles campaign PCA reports where metrics are "Spend: R100,000" etc.
 * Each slide with enough KV data becomes one row.
 */
async function extractKeyValueDataAsync(
  zip: JSZip,
  slideFiles: string[],
  domParser: DOMParser,
): Promise<ParsedFileResult | null> {
  const slideRows: { period: string; campaign: string; metrics: Record<string, string> }[] = [];

  for (const slidePath of slideFiles) {
    const xml = await zip.files[slidePath].async("text");
    const doc = domParser.parseFromString(xml, "application/xml");

    // Collect all paragraphs from all shapes on this slide
    const allParagraphTexts: string[] = [];
    let slideTitle = "";

    const shapes = doc.getElementsByTagName("p:sp");
    for (let s = 0; s < shapes.length; s++) {
      const sp = shapes[s];

      // Check if this is a title shape
      const phEl = sp.getElementsByTagName("p:ph")[0];
      const isTitle = phEl?.getAttribute("type") === "title" || phEl?.getAttribute("type") === "ctrTitle";

      // Extract text, splitting on both <a:p> paragraphs AND <a:br> line breaks
      const txBody = sp.getElementsByTagName("p:txBody")[0];
      if (!txBody) continue;

      const paragraphs = txBody.getElementsByTagName("a:p");
      for (let p = 0; p < paragraphs.length; p++) {
        // Walk child nodes of <a:p> to respect <a:br> line breaks
        const lines: string[] = [];
        let currentLine: string[] = [];

        const children = paragraphs[p].childNodes;
        for (let ci = 0; ci < children.length; ci++) {
          const child = children[ci];
          const tagName = (child as Element).tagName ?? child.nodeName;

          if (tagName === "a:br") {
            // Line break — flush current line
            const text = currentLine.join("").trim();
            if (text) lines.push(text);
            currentLine = [];
          } else if (tagName === "a:r") {
            // Run — extract text
            const tNodes = (child as Element).getElementsByTagName("a:t");
            for (let ti = 0; ti < tNodes.length; ti++) {
              currentLine.push(tNodes[ti].textContent ?? "");
            }
          }
        }
        // Flush last line
        const lastText = currentLine.join("").trim();
        if (lastText) lines.push(lastText);

        for (const lineText of lines) {
          allParagraphTexts.push(lineText);
          if (isTitle && !slideTitle) slideTitle = lineText;
        }
      }
    }

    if (allParagraphTexts.length === 0) continue;

    // Parse key-value pairs from paragraphs
    const metrics: Record<string, string> = {};
    let period = "";
    let campaign = slideTitle;

    for (const line of allParagraphTexts) {
      // Try "Key: Value" pattern — only short keys (metric labels, not narrative sentences)
      const kvMatch = line.match(/^([^:]{1,40}):\s*(.+)$/);
      if (kvMatch) {
        const rawKey = kvMatch[1].trim().toLowerCase();
        const rawValue = kvMatch[2].trim();

        // Skip if key looks like narrative text (too many words = likely a sentence)
        const keyWordCount = rawKey.split(/\s+/).length;
        if (keyWordCount > 5) continue;

        // Check if this is a known metric
        const canonical = KV_METRIC_MAP[rawKey];
        if (canonical) {
          metrics[canonical] = rawValue;
          continue;
        }

        // Check for special keys
        if (rawKey === "benchmarks" || rawKey === "benchmark") {
          metrics["benchmark"] = rawValue;
          continue;
        }
        if (rawKey === "platform" || rawKey === "channel" || rawKey === "media") {
          metrics["platform"] = rawValue;
          continue;
        }
        if (rawKey === "campaign" || rawKey === "campaign name") {
          campaign = rawValue;
          continue;
        }
        if (rawKey === "period" || rawKey === "flight" || rawKey === "date" || rawKey === "month") {
          period = rawValue;
          continue;
        }
        if (rawKey === "brand" || rawKey === "product") {
          metrics["brand"] = rawValue;
          continue;
        }
        if (rawKey === "retailer" || rawKey === "partner") {
          metrics["retailer"] = rawValue;
          continue;
        }
      }

      // Detect standalone period identifiers (month names, quarters, etc.)
      const lineLower = line.toLowerCase().trim();
      if (!period) {
        if (MONTH_NAMES.some(m => lineLower === m || lineLower.match(new RegExp(`^${m}\\s+\\d{2,4}$`)))) {
          period = line.trim();
        } else if (QUARTER_RE.test(lineLower) || WEEK_RE.test(lineLower) || DATE_RANGE_RE.test(line.trim())) {
          period = line.trim();
        }
      }
    }

    // Only add this slide if we found at least 2 metrics
    if (Object.keys(metrics).length >= 2) {
      slideRows.push({ period, campaign, metrics });
    }
  }

  if (slideRows.length === 0) return null;

  // Build unified header set from all slides
  const allMetricKeys = new Set<string>();
  for (const row of slideRows) {
    for (const key of Object.keys(row.metrics)) allMetricKeys.add(key);
  }

  // Construct headers: period, campaign_name, then all metric columns
  const headers: string[] = [];
  if (slideRows.some(r => r.period)) headers.push("period");
  if (slideRows.some(r => r.campaign)) headers.push("campaign_name");

  // Sort metric keys to put the most important ones first
  const metricOrder = [
    "spend", "impressions", "clicks", "ctr", "cpm", "cpc",
    "revenue", "conversions", "units_sold", "roas", "aov",
    "reach", "frequency", "video_views", "view_rate",
    "engagements", "engagement_rate", "cpo", "cps",
    "benchmark", "platform", "brand", "retailer",
  ];
  const sortedMetrics = [...allMetricKeys].sort((a, b) => {
    const ai = metricOrder.indexOf(a);
    const bi = metricOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  headers.push(...sortedMetrics);

  // Build rows
  const rows: Record<string, unknown>[] = slideRows.map(sr => {
    const obj: Record<string, unknown> = {};
    if (headers.includes("period")) obj["period"] = sr.period || null;
    if (headers.includes("campaign_name")) obj["campaign_name"] = sr.campaign || null;
    for (const key of sortedMetrics) {
      obj[key] = sr.metrics[key] ?? null;
    }
    return obj;
  });

  return { headers, rows };
}

/** Extract text from shapes using position data to reconstruct table layout */
async function extractTextFromShapes(
  zip: JSZip,
  slideFiles: string[],
  domParser: DOMParser,
): Promise<ParsedFileResult | null> {
  // Collect all text items with approximate positions across all slides
  const allItems: { slideIdx: number; x: number; y: number; text: string }[] = [];

  for (let si = 0; si < slideFiles.length; si++) {
    const xml = await zip.files[slideFiles[si]].async("text");
    const doc = domParser.parseFromString(xml, "application/xml");

    // Find all shape trees — shapes live inside <p:spTree>
    const shapes = doc.getElementsByTagName("p:sp");
    for (let s = 0; s < shapes.length; s++) {
      const sp = shapes[s];

      // Get position from <a:off x="..." y="..."/>
      const offEl = sp.getElementsByTagName("a:off")[0];
      const x = offEl ? parseInt(offEl.getAttribute("x") ?? "0", 10) : 0;
      const y = offEl ? parseInt(offEl.getAttribute("y") ?? "0", 10) : 0;

      // Get all text in this shape
      const textNodes = sp.getElementsByTagName("a:t");
      const parts: string[] = [];
      for (let t = 0; t < textNodes.length; t++) {
        const txt = textNodes[t].textContent?.trim();
        if (txt) parts.push(txt);
      }
      const fullText = parts.join(" ").trim();
      if (fullText) {
        allItems.push({ slideIdx: si, x, y, text: fullText });
      }
    }
  }

  if (allItems.length < 4) return null; // Need at least a few cells

  // Group by slide, then by Y-coordinate (with tolerance) to form rows
  const slideGroups = new Map<number, typeof allItems>();
  for (const item of allItems) {
    const list = slideGroups.get(item.slideIdx) ?? [];
    list.push(item);
    slideGroups.set(item.slideIdx, list);
  }

  const allRows: string[][] = [];

  for (const [, items] of slideGroups) {
    // Cluster Y coordinates with tolerance (EMUs — 914400 per inch, ~100000 tolerance for same row)
    const yTolerance = 150000;
    const sorted = items.sort((a, b) => a.y - b.y || a.x - b.x);

    const yBuckets: { y: number; items: typeof items }[] = [];
    for (const item of sorted) {
      const bucket = yBuckets.find(b => Math.abs(b.y - item.y) < yTolerance);
      if (bucket) {
        bucket.items.push(item);
      } else {
        yBuckets.push({ y: item.y, items: [item] });
      }
    }

    // Each Y-bucket is a row; sort cells left-to-right
    for (const bucket of yBuckets) {
      const cells = bucket.items.sort((a, b) => a.x - b.x).map(i => i.text);
      if (cells.length >= 2) allRows.push(cells);
    }
  }

  if (allRows.length < 2) return null;

  // Normalise: find the most common column count
  const colCounts = allRows.map(r => r.length);
  const modeCount = colCounts.sort((a, b) =>
    colCounts.filter(v => v === a).length - colCounts.filter(v => v === b).length
  ).pop() ?? 0;

  // Keep only rows matching the mode column count (±1)
  const filteredRows = allRows.filter(r => Math.abs(r.length - modeCount) <= 1);
  if (filteredRows.length < 2) return null;

  // Pad or trim rows to match header length
  const headerLen = filteredRows[0].length;
  const normalised = filteredRows.map(r => {
    if (r.length === headerLen) return r;
    if (r.length > headerLen) return r.slice(0, headerLen);
    return [...r, ...Array(headerLen - r.length).fill("")];
  });

  return rowsToResult(normalised);
}

/** Parse tab-delimited or multi-space-delimited lines into result */
function parseDelimitedLines(lines: string[]): ParsedFileResult {
  const firstLine = lines[0];
  let separator: string | RegExp;
  if (firstLine.includes("\t")) separator = "\t";
  else if (firstLine.includes("|")) separator = "|";
  else separator = /\s{2,}/;

  const headers = (typeof separator === "string"
    ? firstLine.split(separator)
    : firstLine.split(separator)
  ).map(h => h.trim()).filter(h => h.length > 0);

  if (headers.length < 2) {
    throw new Error("Could not detect column structure. Try CSV or XLSX format.");
  }

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = (typeof separator === "string"
      ? lines[i].split(separator)
      : lines[i].split(separator)
    ).map(c => c.trim());
    if (cells.length < Math.max(2, headers.length - 2) || cells.length > headers.length + 2) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => { obj[h] = cells[idx] ?? null; });
    rows.push(obj);
  }

  if (rows.length === 0) {
    throw new Error("Extracted headers but no data rows matched. Try CSV or XLSX.");
  }
  return { headers, rows };
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
/*  Additional parsers — TSV, JSON, XML                               */
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

function parseJSONText(text: string): ParsedFileResult {
  const parsed = JSON.parse(text);
  let arr: Record<string, unknown>[];

  if (Array.isArray(parsed)) {
    arr = parsed;
  } else if (typeof parsed === "object" && parsed !== null) {
    // Try to find the first array property
    const arrayKey = Object.keys(parsed).find((k) => Array.isArray(parsed[k]));
    if (arrayKey) {
      arr = parsed[arrayKey];
    } else {
      // Single object → wrap in array
      arr = [parsed];
    }
  } else {
    throw new Error("JSON file does not contain structured data.");
  }

  if (arr.length === 0) throw new Error("JSON array is empty.");

  // Flatten nested objects with dot notation
  const flattened = arr.map((item) => {
    const flat: Record<string, unknown> = {};
    const flatten = (obj: Record<string, unknown>, prefix: string) => {
      for (const [key, val] of Object.entries(obj)) {
        const newKey = prefix ? `${prefix}_${key}` : key;
        if (val && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) {
          flatten(val as Record<string, unknown>, newKey);
        } else {
          flat[newKey] = val;
        }
      }
    };
    flatten(item, "");
    return flat;
  });

  // Collect all keys from all rows
  const headerSet = new Set<string>();
  flattened.forEach((r) => Object.keys(r).forEach((k) => headerSet.add(k)));
  const headers = [...headerSet];
  return { headers, rows: flattened };
}

function parseXMLText(text: string): ParsedFileResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "application/xml");

  // Find the most common repeating element (rows)
  const allTags = doc.querySelectorAll("*");
  const tagCounts: Record<string, number> = {};
  allTags.forEach((el) => {
    const name = el.tagName;
    tagCounts[name] = (tagCounts[name] ?? 0) + 1;
  });

  // Find the tag that appears most often (likely row elements)
  const sorted = Object.entries(tagCounts)
    .filter(([, c]) => c >= 2)
    .sort(([, a], [, b]) => b - a);

  for (const [tagName] of sorted) {
    const elements = doc.getElementsByTagName(tagName);
    if (elements.length < 2) continue;

    // Check if these elements have child elements (cells)
    const firstEl = elements[0];
    const childTags = Array.from(firstEl.children).map((c) => c.tagName);
    if (childTags.length < 2) continue;

    // Use child tag names as headers
    const headers = childTags;
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const obj: Record<string, unknown> = {};
      for (const childTag of headers) {
        const child = el.getElementsByTagName(childTag)[0];
        obj[childTag] = child?.textContent?.trim() ?? null;
      }
      rows.push(obj);
    }
    if (rows.length >= 1) return { headers, rows };
  }

  throw new Error("Could not extract tabular data from XML. Try CSV or XLSX format.");
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
    case "json": {
      const text = await file.text();
      return parseJSONText(text);
    }
    case "xml": {
      const text = await file.text();
      return parseXMLText(text);
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
      // Smart fallback: try text-based formats first, then binary
      try {
        const text = await file.text();
        // Try JSON
        if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
          return parseJSONText(text);
        }
        // Try XML
        if (text.trim().startsWith("<")) {
          return parseXMLText(text);
        }
        // Try delimited text
        return parseDelimitedText(text);
      } catch {
        // Try XLSX then PPTX for binary files
        try {
          const buffer = await file.arrayBuffer();
          return parseXLSXBuffer(buffer);
        } catch {
          try {
            return await parsePPTXBlob(file);
          } catch {
            throw new Error(`Could not parse file: .${ext}. Try converting to CSV, XLSX, JSON, or PDF.`);
          }
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
  const schemaReport = buildFileSchemaReport(headers, rows);
  return { columns: headers, preview: previewRows, schemaReport };
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
): Promise<{ rowsInserted: number; detectedType: string; fieldMap: Record<string, string>; schemaReport?: SchemaReport }> {
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

  // Stage 2: Detect type & map columns (with multi-table support)
  progress("Classifying columns...", 1, 0, jsonRows.length);
  const types = detectDataTypes(headers);
  const isMixed = types.sell_out && types.campaign;
  const isCampaignOnly = types.campaign && !types.sell_out;

  const soFieldMap = (types.sell_out) ? buildFieldMap(headers, SELL_OUT_ALIASES) : {};
  const cpFieldMap = (types.campaign) ? buildFieldMap(headers, CAMPAIGN_ALIASES) : {};

  // Primary type for upload record
  const detectedType = isMixed ? "mixed" : (isCampaignOnly ? "campaign" : "sell_out");
  const fieldMap = isCampaignOnly ? cpFieldMap : soFieldMap;

  // Build schema report
  const schemaReport = buildFileSchemaReport(headers, jsonRows);

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
    column_mapping: isMixed ? { ...soFieldMap, ...cpFieldMap } : fieldMap,
    source_type: isCampaignOnly ? "ad_platform" : (isMixed ? "mixed" : "retailer"),
    status: "processing",
    project_id: projectId,
  }).eq("id", uploadId);

  const getFieldSO = (row: Record<string, unknown>, canonical: string): unknown => {
    const headerKey = soFieldMap[canonical];
    return headerKey ? row[headerKey] : null;
  };
  const getFieldCP = (row: Record<string, unknown>, canonical: string): unknown => {
    const headerKey = cpFieldMap[canonical];
    return headerKey ? row[headerKey] : null;
  };

  // Stage 3: Insert data in batches
  progress("Inserting data...", 2, 0, jsonRows.length);
  const BATCH_SIZE = 500;
  let totalInserted = 0;

  for (let i = 0; i < jsonRows.length; i += BATCH_SIZE) {
    const batch = jsonRows.slice(i, i + BATCH_SIZE);

    // Insert into sell_out_data if detected
    if (types.sell_out) {
      const records = batch.map((row) => ({
        user_id: userId,
        project_id: projectId,
        upload_id: uploadId,
        date: parseDate(getFieldSO(row, "date")) || null,
        product_name_raw: getFieldSO(row, "product_name_raw") ? String(getFieldSO(row, "product_name_raw")) : null,
        sku: getFieldSO(row, "sku") ? String(getFieldSO(row, "sku")) : null,
        retailer: getFieldSO(row, "retailer") ? String(getFieldSO(row, "retailer")) : (sourceName || null),
        store_location: getFieldSO(row, "store_location") ? String(getFieldSO(row, "store_location")) : null,
        region: getFieldSO(row, "region") ? String(getFieldSO(row, "region")) : null,
        category: getFieldSO(row, "category") ? String(getFieldSO(row, "category")) : null,
        brand: getFieldSO(row, "brand") ? String(getFieldSO(row, "brand")) : null,
        sub_brand: getFieldSO(row, "sub_brand") ? String(getFieldSO(row, "sub_brand")) : null,
        format_size: getFieldSO(row, "format_size") ? String(getFieldSO(row, "format_size")) : null,
        revenue: num(getFieldSO(row, "revenue")) ?? null,
        units_sold: num(getFieldSO(row, "units_sold")) ? Math.round(num(getFieldSO(row, "units_sold"))!) : null,
        units_supplied: num(getFieldSO(row, "units_supplied")) ?? null,
        cost: num(getFieldSO(row, "cost")) ?? null,
      }));

      const { error } = await supabase.from("sell_out_data").insert(records);
      if (error) {
        console.error("Sell-out insert error:", error.message);
        if (totalInserted === 0 && i === 0 && !types.campaign) throw new Error(`Data insert failed: ${error.message}`);
      } else {
        totalInserted += records.length;
      }
    }

    // Insert into campaign_data_v2 if detected
    if (types.campaign) {
      const records = batch.map((row) => ({
        user_id: userId,
        project_id: projectId,
        upload_id: uploadId,
        flight_start: parseDate(getFieldCP(row, "flight_start")) || null,
        flight_end: parseDate(getFieldCP(row, "flight_end")) || null,
        platform: getFieldCP(row, "platform") ? String(getFieldCP(row, "platform")) : null,
        channel: getFieldCP(row, "channel") ? String(getFieldCP(row, "channel")) : null,
        campaign_name: getFieldCP(row, "campaign_name") ? String(getFieldCP(row, "campaign_name")) : null,
        spend: num(getFieldCP(row, "spend")) ?? null,
        impressions: num(getFieldCP(row, "impressions")) ? Math.round(num(getFieldCP(row, "impressions"))!) : null,
        clicks: num(getFieldCP(row, "clicks")) ? Math.round(num(getFieldCP(row, "clicks"))!) : null,
        ctr: num(getFieldCP(row, "ctr")) ?? null,
        conversions: num(getFieldCP(row, "conversions")) ? Math.round(num(getFieldCP(row, "conversions"))!) : null,
        revenue: num(getFieldCP(row, "revenue")) ?? null,
        total_sales_attributed: num(getFieldCP(row, "total_sales_attributed")) ?? null,
        total_units_attributed: num(getFieldCP(row, "total_units_attributed")) ? Math.round(num(getFieldCP(row, "total_units_attributed"))!) : null,
      }));

      const { error } = await supabase.from("campaign_data_v2").insert(records);
      if (error) {
        console.error("Campaign insert error:", error.message);
        if (totalInserted === 0 && i === 0) throw new Error(`Data insert failed: ${error.message}`);
      } else {
        if (!types.sell_out) totalInserted += records.length; // Avoid double-counting mixed
      }
    }

    progress("Inserting data...", 2, totalInserted, jsonRows.length);
    await new Promise((r) => setTimeout(r, 50));
  }

  // Stage 4: Compute metrics
  progress("Computing metrics...", 3, totalInserted, jsonRows.length);

  if (types.sell_out && totalInserted > 0) {
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

  if (types.campaign && totalInserted > 0) {
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

  return { rowsInserted: totalInserted, detectedType, fieldMap, schemaReport };
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
