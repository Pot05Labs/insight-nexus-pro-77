import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function norm(s: string): string {
  return s.trim().replace(/^["']|["']$/g, "").toLowerCase();
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  let s = String(v).trim();
  // Strip ZAR "R" prefix (e.g. "R200,000" or "R 100 000")
  s = s.replace(/^R\s*/i, "");
  // Strip percentage suffix for CTR etc
  s = s.replace(/%\s*$/, "");
  // Remove currency symbols, commas, spaces
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
/*  Column aliases (synced with client canonical-schemas.ts)           */
/* ------------------------------------------------------------------ */

const SELL_OUT_ALIASES: Record<string, string[]> = {
  date: ["date", "date_delivery", "date delivery", "delivery_date", "delivery date", "delivery_day",
    "week", "period", "month", "day", "report_date", "sale_date", "transaction_date", "order_date", "invoice_date"],
  product_name_raw: ["product", "product_name", "product_name_raw", "item", "description",
    "product_description", "item_name", "title", "product_title", "item_description"],
  sku: ["sku", "sku/subs sku", "sku_code", "subs_sku", "ean", "barcode", "upc", "asin",
    "product_code", "item_code", "article", "article_code", "material", "material_code"],
  retailer: ["retailer", "vendor", "channel", "store", "marketplace", "outlet", "account",
    "customer", "store_name", "account_name", "partner", "supplier"],
  store_location: ["store_location", "location", "store_loc", "outlet_location", "branch", "site"],
  region: ["region", "area", "territory", "geo", "geography", "market", "province"],
  category: ["category", "product_category", "cat", "segment", "product_group", "department"],
  brand: ["brand", "brand_name", "manufacturer"],
  sub_brand: ["sub_brand", "subbrand", "sub_brand_name", "variant", "subs product", "subs_product"],
  format_size: ["format_size", "format", "size", "pack_size", "pack", "packaging"],
  revenue: ["revenue", "sales", "total_sales", "net_sales", "gross_sales", "sales_value",
    "ordered_value", "ordered value", "amount", "value", "turnover",
    "net_revenue", "gross_revenue", "total_value"],
  actual_revenue: ["merchandise_sales", "merchandise sales", "actual_sales",
    "actual_revenue", "sell_through_value", "sell_through", "net_merchandise"],
  units_sold: ["units", "units_sold", "qty", "quantity", "volume", "units_ordered",
    "ordered_qty", "ordered qty", "qty_sold", "sold_qty", "total_units"],
  units_supplied: ["units_supplied", "supplied", "supply_qty", "qty_supplied",
    "supplied_qty", "supplied qty", "delivered", "units_delivered"],
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

/* ------------------------------------------------------------------ */
/*  Detection & Mapping                                               */
/* ------------------------------------------------------------------ */

type DetectedTypes = { sell_out: boolean; campaign: boolean };

function detectDataTypes(headers: string[]): DetectedTypes {
  const normHeaders = headers.map(norm);
  let sellOutScore = 0;
  let campaignScore = 0;
  for (const h of normHeaders) {
    if (SELL_OUT_SIGNALS.some((s) => h === s || h.includes(s))) sellOutScore++;
    if (CAMPAIGN_SIGNALS.some((s) => h === s || h.includes(s))) campaignScore++;
  }
  if (sellOutScore >= 3 && campaignScore >= 3) return { sell_out: true, campaign: true };
  if (campaignScore > sellOutScore) return { sell_out: false, campaign: true };
  return { sell_out: true, campaign: false };
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
/*  PPTX Parser — spatial shape extraction                            */
/* ------------------------------------------------------------------ */

// Label → campaign schema field mapping for PPTX shapes
const PPTX_LABEL_MAP: Record<string, string> = {
  "total spend": "spend", "media spend": "spend", "ad spend": "spend",
  "investment": "spend", "spend": "spend", "budget": "spend",
  "total impressions": "impressions", "impressions": "impressions", "imps": "impressions",
  "total clicks": "clicks", "clicks": "clicks", "link clicks": "clicks",
  "ctr": "ctr", "average ctr": "ctr", "click through rate": "ctr", "click-through rate": "ctr",
  "cpm": "cpm", "onsite cpm": "cpm", "cost per mille": "cpm",
  "cpc": "cpc", "cost per click": "cpc",
  "total sales": "revenue", "revenue": "revenue", "sales": "revenue",
  "total revenue": "revenue", "attributed revenue": "revenue", "purchase value": "revenue",
  "total units sold": "units_sold", "units sold": "units_sold", "units": "units_sold",
  "total units": "units_sold", "quantity": "units_sold",
  "conversions": "conversions", "orders": "conversions", "purchases": "conversions",
  "total orders": "conversions", "total conversions": "conversions",
  "roas": "roas", "return on ad spend": "roas",
  "reach": "reach", "total reach": "reach",
  "frequency": "frequency", "avg frequency": "frequency",
  "video views": "video_views", "views": "video_views",
  "aov": "aov", "average order value": "aov",
};

interface ShapeItem {
  slideIdx: number;
  x: number;
  y: number;
  text: string;
  isTitle: boolean;
}

type ParsedResult = { headers: string[]; rows: Record<string, unknown>[] };

function parseXMLBasic(xml: string): {
  shapes: { x: number; y: number; text: string; isTitle: boolean }[];
  tables: string[][];
} {
  const shapes: { x: number; y: number; text: string; isTitle: boolean }[] = [];
  const tables: string[][] = [];

  // Extract table rows (<a:tbl> → <a:tr> → <a:tc> → <a:t>)
  const tblRegex = /<a:tbl\b[^>]*>([\s\S]*?)<\/a:tbl>/g;
  let tblMatch;
  while ((tblMatch = tblRegex.exec(xml)) !== null) {
    const tblContent = tblMatch[1];
    const trRegex = /<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g;
    let trMatch;
    while ((trMatch = trRegex.exec(tblContent)) !== null) {
      const trContent = trMatch[1];
      const tcRegex = /<a:tc\b[^>]*>([\s\S]*?)<\/a:tc>/g;
      const cells: string[] = [];
      let tcMatch;
      while ((tcMatch = tcRegex.exec(trContent)) !== null) {
        const textParts: string[] = [];
        const atRegex = /<a:t>([^<]*)<\/a:t>/g;
        let atMatch;
        while ((atMatch = atRegex.exec(tcMatch[1])) !== null) {
          if (atMatch[1].trim()) textParts.push(atMatch[1].trim());
        }
        cells.push(textParts.join(" ").trim());
      }
      if (cells.length > 0 && cells.some(c => c !== "")) {
        tables.push(cells);
      }
    }
  }

  // Extract shapes (<p:sp>) with position
  const spRegex = /<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/g;
  let spMatch;
  while ((spMatch = spRegex.exec(xml)) !== null) {
    const spContent = spMatch[1];

    // Check if title
    const isTitle = /<p:ph[^>]*type="(?:title|ctrTitle)"/.test(spContent);

    // Get position
    const offMatch = spContent.match(/<a:off\s+x="(\d+)"\s+y="(\d+)"/);
    const x = offMatch ? parseInt(offMatch[1], 10) : 0;
    const y = offMatch ? parseInt(offMatch[2], 10) : 0;

    // Get text
    const textParts: string[] = [];
    const atRegex = /<a:t>([^<]*)<\/a:t>/g;
    let atMatch;
    while ((atMatch = atRegex.exec(spContent)) !== null) {
      if (atMatch[1].trim()) textParts.push(atMatch[1].trim());
    }
    const fullText = textParts.join(" ").trim();
    if (fullText) {
      shapes.push({ x, y, text: fullText, isTitle });
    }
  }

  return { shapes, tables };
}

async function parsePPTX(blob: Blob): Promise<ParsedResult> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());

  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)/i)?.[1] ?? "0");
      const nb = parseInt(b.match(/slide(\d+)/i)?.[1] ?? "0");
      return na - nb;
    });

  if (slideFiles.length === 0) {
    throw new Error("No slides found in PPTX file.");
  }

  // Collect all data across slides
  const allTableRows: string[][] = [];
  const allShapes: ShapeItem[] = [];

  for (let si = 0; si < slideFiles.length; si++) {
    const xml = await zip.files[slideFiles[si]].async("text");
    const { shapes, tables } = parseXMLBasic(xml);

    for (const row of tables) allTableRows.push(row);
    for (const shape of shapes) {
      allShapes.push({ slideIdx: si, ...shape });
    }
  }

  // ── Strategy A: Tables ──
  if (allTableRows.length >= 2) {
    const headers = allTableRows[0];
    const rows = allTableRows.slice(1).map(row => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => { obj[h] = row[i] ?? null; });
      return obj;
    });
    return { headers, rows };
  }

  // ── Strategy B: Key-Value colon pairs per slide ──
  const kvSlideRows = extractKVFromShapes(allShapes, slideFiles.length);
  if (kvSlideRows && kvSlideRows.rows.length >= 1) {
    return kvSlideRows;
  }

  // ── Strategy C: Spatial grouping per slide ──
  const spatialResult = extractSpatialData(allShapes, slideFiles.length);
  if (spatialResult && spatialResult.rows.length >= 1) {
    return spatialResult;
  }

  // ── Strategy D: Flat text ──
  const flatLines: string[] = [];
  for (let si = 0; si < slideFiles.length; si++) {
    const slideShapes = allShapes.filter(s => s.slideIdx === si);
    if (slideShapes.length > 0) {
      flatLines.push(slideShapes.map(s => s.text).join("\t"));
    }
  }
  if (flatLines.length >= 2) {
    const headers = flatLines[0].split("\t").map(h => h.trim()).filter(Boolean);
    if (headers.length >= 2) {
      const rows = flatLines.slice(1).map(line => {
        const cells = line.split("\t").map(c => c.trim());
        const obj: Record<string, unknown> = {};
        headers.forEach((h, i) => { obj[h] = cells[i] ?? null; });
        return obj;
      });
      return { headers, rows };
    }
  }

  throw new Error(
    "Could not extract structured data from this PowerPoint. " +
    "Try exporting data as CSV or XLSX for best results."
  );
}

function extractKVFromShapes(shapes: ShapeItem[], slideCount: number): ParsedResult | null {
  const slideRows: { campaign: string; metrics: Record<string, string> }[] = [];

  for (let si = 0; si < slideCount; si++) {
    const slideShapes = shapes.filter(s => s.slideIdx === si);
    const metrics: Record<string, string> = {};
    let campaign = "";

    for (const shape of slideShapes) {
      if (shape.isTitle && !campaign) campaign = shape.text;

      // Check "Key: Value" pattern
      const kvMatch = shape.text.match(/^([^:]{1,40}):\s*(.+)$/);
      if (kvMatch) {
        const rawKey = kvMatch[1].trim().toLowerCase();
        const rawValue = kvMatch[2].trim();
        const keyWordCount = rawKey.split(/\s+/).length;
        if (keyWordCount > 5) continue;

        const canonical = PPTX_LABEL_MAP[rawKey];
        if (canonical) {
          metrics[canonical] = rawValue;
        } else if (rawKey === "campaign" || rawKey === "campaign name") {
          campaign = rawValue;
        } else if (rawKey === "platform" || rawKey === "channel") {
          metrics["platform"] = rawValue;
        }
      }
    }

    if (Object.keys(metrics).length >= 2) {
      slideRows.push({ campaign, metrics });
    }
  }

  if (slideRows.length === 0) return null;

  return buildCampaignResult(slideRows);
}

function extractSpatialData(shapes: ShapeItem[], slideCount: number): ParsedResult | null {
  const slideRows: { campaign: string; platform: string; metrics: Record<string, string> }[] = [];
  const Y_TOLERANCE = 50000; // EMUs

  for (let si = 0; si < slideCount; si++) {
    const slideShapes = shapes.filter(s => s.slideIdx === si && !s.isTitle);
    const titleShape = shapes.find(s => s.slideIdx === si && s.isTitle);
    const campaign = titleShape?.text ?? "";

    if (slideShapes.length < 4) continue; // Need at least 2 label-value pairs

    // Group by Y-position
    const sorted = [...slideShapes].sort((a, b) => a.y - b.y || a.x - b.x);
    const yBuckets: { y: number; items: ShapeItem[] }[] = [];
    for (const item of sorted) {
      const bucket = yBuckets.find(b => Math.abs(b.y - item.y) < Y_TOLERANCE);
      if (bucket) {
        bucket.items.push(item);
      } else {
        yBuckets.push({ y: item.y, items: [item] });
      }
    }

    // Extract label-value pairs from rows
    const metrics: Record<string, string> = {};
    let platform = "";

    for (const bucket of yBuckets) {
      const cells = bucket.items.sort((a, b) => a.x - b.x).map(i => i.text);

      // 2-cell row: label → value
      if (cells.length === 2) {
        const label = cells[0].toLowerCase().replace(/[:\-–—]/g, "").trim();
        const value = cells[1].trim();
        const canonical = PPTX_LABEL_MAP[label];
        if (canonical) metrics[canonical] = value;
      }

      // 4-cell row: label, value, label, value
      if (cells.length === 4) {
        for (let i = 0; i < cells.length - 1; i += 2) {
          const label = cells[i].toLowerCase().replace(/[:\-–—]/g, "").trim();
          const value = cells[i + 1].trim();
          const canonical = PPTX_LABEL_MAP[label];
          if (canonical) metrics[canonical] = value;
        }
      }

      // 6-cell row: 3 pairs
      if (cells.length === 6) {
        for (let i = 0; i < cells.length - 1; i += 2) {
          const label = cells[i].toLowerCase().replace(/[:\-–—]/g, "").trim();
          const value = cells[i + 1].trim();
          const canonical = PPTX_LABEL_MAP[label];
          if (canonical) metrics[canonical] = value;
        }
      }

      // Single-cell: check for platform names or inline "Key: Value"
      if (cells.length === 1) {
        const text = cells[0];
        const kvMatch = text.match(/^([^:]{1,40}):\s*(.+)$/);
        if (kvMatch) {
          const label = kvMatch[1].trim().toLowerCase();
          const value = kvMatch[2].trim();
          const canonical = PPTX_LABEL_MAP[label];
          if (canonical) metrics[canonical] = value;
        }
        // Detect platform
        const platformNames = ["meta", "facebook", "google", "tiktok", "dstv", "multichoice",
          "checkers", "onecart", "mr d", "takealot", "woolworths", "pick n pay", "shoprite"];
        const lower = text.toLowerCase();
        for (const p of platformNames) {
          if (lower.includes(p)) { platform = text.trim(); break; }
        }
      }
    }

    if (Object.keys(metrics).length >= 2) {
      slideRows.push({ campaign, platform, metrics });
    }
  }

  if (slideRows.length === 0) return null;

  return buildCampaignResult(slideRows.map(r => ({
    campaign: r.campaign,
    metrics: { ...r.metrics, ...(r.platform ? { platform: r.platform } : {}) },
  })));
}

function buildCampaignResult(
  slideRows: { campaign: string; metrics: Record<string, string> }[]
): ParsedResult {
  // Collect all metric keys
  const allKeys = new Set<string>();
  for (const row of slideRows) {
    for (const key of Object.keys(row.metrics)) allKeys.add(key);
  }

  // Build headers: campaign_name first, then metrics in priority order
  const metricOrder = [
    "spend", "impressions", "clicks", "ctr", "cpm", "cpc",
    "revenue", "conversions", "units_sold", "roas", "aov",
    "reach", "frequency", "video_views",
    "platform", "brand", "retailer",
  ];
  const sortedMetrics = [...allKeys].sort((a, b) => {
    const ai = metricOrder.indexOf(a);
    const bi = metricOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const headers = ["campaign_name", ...sortedMetrics];

  const rows: Record<string, unknown>[] = slideRows.map(sr => {
    const obj: Record<string, unknown> = { campaign_name: sr.campaign || null };
    for (const key of sortedMetrics) {
      obj[key] = sr.metrics[key] ?? null;
    }
    return obj;
  });

  return { headers, rows };
}

/* ------------------------------------------------------------------ */
/*  Lightweight XLSX Parser (uses JSZip, no xlsx library)              */
/* ------------------------------------------------------------------ */

function colToIndex(col: string): number {
  let idx = 0;
  for (let i = 0; i < col.length; i++) {
    idx = idx * 26 + (col.charCodeAt(i) - 64);
  }
  return idx - 1;
}

async function parseXLSX(blob: Blob): Promise<ParsedResult> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());

  // 1. Read shared strings table
  const sharedStrings: string[] = [];
  const ssFile = zip.files["xl/sharedStrings.xml"];
  if (ssFile) {
    const ssXml = await ssFile.async("text");
    const siRegex = /<si>([\s\S]*?)<\/si>/g;
    let siMatch;
    while ((siMatch = siRegex.exec(ssXml)) !== null) {
      const tParts: string[] = [];
      const tRegex = /<t[^>]*>([^<]*)<\/t>/g;
      let tMatch;
      while ((tMatch = tRegex.exec(siMatch[1])) !== null) {
        tParts.push(tMatch[1]);
      }
      sharedStrings.push(tParts.join(""));
    }
  }

  // 2. Determine which sheet file to use
  //    Try sheet1.xml first, fall back to first available sheet
  let sheetXml = "";
  const sheetFile = zip.files["xl/worksheets/sheet1.xml"];
  if (sheetFile) {
    sheetXml = await sheetFile.async("text");
  } else {
    const sheetKeys = Object.keys(zip.files)
      .filter(k => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
      .sort();
    if (sheetKeys.length === 0) throw new Error("No worksheet found in XLSX file.");
    sheetXml = await zip.files[sheetKeys[0]].async("text");
  }

  // 3. Parse date formats from styles.xml for date detection
  const dateFormatIds = new Set<number>();
  const stylesFile = zip.files["xl/styles.xml"];
  if (stylesFile) {
    const stylesXml = await stylesFile.async("text");
    // Built-in date format IDs (Excel standard)
    for (const id of [14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]) {
      dateFormatIds.add(id);
    }
    // Custom date formats
    const fmtRegex = /<numFmt\s+numFmtId="(\d+)"\s+formatCode="([^"]*)"/g;
    let fmtMatch;
    while ((fmtMatch = fmtRegex.exec(stylesXml)) !== null) {
      const code = fmtMatch[2].toLowerCase();
      if (/[ymd]/.test(code) && !/[#0]/.test(code)) {
        dateFormatIds.add(parseInt(fmtMatch[1]));
      }
    }
  }

  // 4. Parse all rows
  const parsedRows: { cells: { col: number; value: string }[] }[] = [];
  let maxCol = 0;

  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const cells: { col: number; value: string }[] = [];

    // Match cells — handle both self-closing and content cells
    const cellRegex = /<c\s+r="([A-Z]{1,3})(\d+)"([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      const colStr = cellMatch[1];
      const attrs = cellMatch[3] ?? "";
      const content = cellMatch[4] ?? "";
      const col = colToIndex(colStr);
      if (col > maxCol) maxCol = col;

      // Extract type and style
      const typeMatch = attrs.match(/t="([^"]*)"/);
      const styleMatch = attrs.match(/s="(\d+)"/);
      const type = typeMatch?.[1] ?? "";
      const _style = styleMatch ? parseInt(styleMatch[1]) : -1;

      // Extract value
      const vMatch = content.match(/<v>([^<]*)<\/v>/);
      const rawVal = vMatch?.[1] ?? "";

      let value = rawVal;

      if (type === "s") {
        // Shared string
        const ssIdx = parseInt(rawVal);
        value = (ssIdx >= 0 && ssIdx < sharedStrings.length) ? sharedStrings[ssIdx] : rawVal;
      } else if (type === "inlineStr") {
        // Inline string
        const isMatch = content.match(/<is>[\s\S]*?<t[^>]*>([^<]*)<\/t>/);
        value = isMatch?.[1] ?? rawVal;
      } else if (type === "b") {
        // Boolean
        value = rawVal === "1" ? "TRUE" : "FALSE";
      } else if (!type && rawVal) {
        // Number — check if it's a date serial
        const numVal = parseFloat(rawVal);
        if (!isNaN(numVal) && numVal > 40000 && numVal < 55000) {
          // Likely an Excel date serial (1909-2050 range)
          // Convert Excel serial to ISO date
          const excelEpoch = new Date(1899, 11, 30);
          const d = new Date(excelEpoch.getTime() + numVal * 86400000);
          if (!isNaN(d.getTime())) {
            value = d.toISOString().split("T")[0];
          }
        }
      }

      cells.push({ col, value: value.trim() });
    }

    if (cells.length > 0) {
      parsedRows.push({ cells });
    }
  }

  if (parsedRows.length < 2) throw new Error("XLSX file has no data rows.");

  // 5. Build header row and data rows
  const headerCells = parsedRows[0].cells;
  const headers: string[] = new Array(maxCol + 1).fill("");
  for (const c of headerCells) {
    headers[c.col] = c.value || `Column_${c.col + 1}`;
  }
  // Remove trailing empty headers
  while (headers.length > 0 && !headers[headers.length - 1]) headers.pop();
  // Fill any remaining gaps
  for (let i = 0; i < headers.length; i++) {
    if (!headers[i]) headers[i] = `Column_${i + 1}`;
  }

  const dataRows: Record<string, unknown>[] = [];
  for (let r = 1; r < parsedRows.length; r++) {
    const rowCells = parsedRows[r].cells;
    if (rowCells.length === 0) continue;

    const obj: Record<string, unknown> = {};
    let hasValue = false;
    for (const c of rowCells) {
      if (c.col < headers.length && c.value) {
        obj[headers[c.col]] = c.value;
        hasValue = true;
      }
    }
    // Skip completely empty rows
    if (hasValue) {
      // Fill missing columns with null
      for (const h of headers) {
        if (!(h in obj)) obj[h] = null;
      }
      dataRows.push(obj);
    }
  }

  if (dataRows.length === 0) throw new Error("XLSX file has no data rows after parsing.");

  return { headers, rows: dataRows };
}

/* ------------------------------------------------------------------ */
/*  CSV Parser                                                        */
/* ------------------------------------------------------------------ */

function parseCSV(text: string): ParsedResult {
  const lines = text.split("\n").filter((l: string) => l.trim());
  if (lines.length < 2) throw new Error("CSV file has no data rows.");

  const headers = lines[0].split(",").map((h: string) => h.trim().replace(/^["']|["']$/g, ""));
  const rows = lines.slice(1).map((l: string) => {
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

/* ------------------------------------------------------------------ */
/*  Main handler                                                      */
/* ------------------------------------------------------------------ */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { uploadId } = await req.json();
    if (!uploadId) {
      return new Response(
        JSON.stringify({ error: "uploadId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Helper to update status with progress message
    const updateStatus = async (status: string, message?: string, extra?: Record<string, unknown>) => {
      await supabase.from("data_uploads").update({
        status,
        error_message: message ?? null,
        ...extra,
      }).eq("id", uploadId);
    };

    // 1. Fetch upload record
    const { data: upload, error: fetchErr } = await supabase
      .from("data_uploads")
      .select("*")
      .eq("id", uploadId)
      .single();

    if (fetchErr || !upload) {
      return new Response(
        JSON.stringify({ error: "Upload not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (upload.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Not authorized" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Download file
    await updateStatus("processing", "Parsing file...");
    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from("uploads")
      .download(upload.storage_path);

    if (dlErr || !fileBlob) {
      await updateStatus("error", "Failed to download file from storage");
      return new Response(
        JSON.stringify({ error: "Download failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse file
    let headers: string[] = [];
    let jsonRows: Record<string, unknown>[] = [];
    const fileType = (upload.file_type ?? "").toLowerCase();

    try {
      if (fileType === "csv") {
        const text = await fileBlob.text();
        const result = parseCSV(text);
        headers = result.headers;
        jsonRows = result.rows;
      } else if (fileType === "tsv" || fileType === "tab" || fileType === "txt") {
        const text = await fileBlob.text();
        const lines = text.split("\n").filter((l: string) => l.trim());
        if (lines.length < 2) throw new Error("File has no data rows.");
        const sep = lines[0].includes("\t") ? "\t" : lines[0].includes("|") ? "|" : ",";
        headers = lines[0].split(sep).map((h: string) => h.trim().replace(/^["']|["']$/g, ""));
        jsonRows = lines.slice(1).map((l: string) => {
          const cells = l.split(sep).map((c: string) => c.trim());
          const obj: Record<string, unknown> = {};
          headers.forEach((h, i) => { obj[h] = cells[i] ?? null; });
          return obj;
        });
      } else if (fileType === "xlsx" || fileType === "xls") {
        const result = await parseXLSX(fileBlob);
        headers = result.headers;
        jsonRows = result.rows;
      } else if (fileType === "pptx") {
        const result = await parsePPTX(fileBlob);
        headers = result.headers;
        jsonRows = result.rows;
      } else if (fileType === "json") {
        const text = await fileBlob.text();
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed) ? parsed
          : (typeof parsed === "object" && parsed !== null)
            ? (parsed[Object.keys(parsed).find((k: string) => Array.isArray(parsed[k])) ?? ""] ?? [parsed])
            : [];
        if (arr.length === 0) throw new Error("JSON file is empty.");
        jsonRows = arr;
        const keySet = new Set<string>();
        jsonRows.forEach((r: Record<string, unknown>) => Object.keys(r).forEach(k => keySet.add(k)));
        headers = [...keySet];
      } else {
        await updateStatus("uploaded", `${fileType.toUpperCase()} files are not yet auto-processable. Export as CSV or XLSX.`);
        return new Response(
          JSON.stringify({ message: "File type not auto-processable", rowsInserted: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : "Parse failed";
      await updateStatus("error", msg);
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (headers.length === 0 || jsonRows.length === 0) {
      await updateStatus("error", "No data found in file");
      return new Response(
        JSON.stringify({ error: "No data in file" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Row limit
    const MAX_ROWS = 200_000;
    if (jsonRows.length > MAX_ROWS) {
      await updateStatus("error", `File exceeds ${MAX_ROWS.toLocaleString()} row limit (found ${jsonRows.length.toLocaleString()} rows).`);
      return new Response(
        JSON.stringify({ error: "Row limit exceeded" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Detect type & map
    await updateStatus("processing", "Classifying columns...");
    const types = detectDataTypes(headers);
    const isMixed = types.sell_out && types.campaign;
    const isCampaignOnly = types.campaign && !types.sell_out;
    const detectedType = isMixed ? "mixed" : (isCampaignOnly ? "campaign" : "sell_out");

    const soFieldMap = types.sell_out ? buildFieldMap(headers, SELL_OUT_ALIASES) : {};
    const cpFieldMap = types.campaign ? buildFieldMap(headers, CAMPAIGN_ALIASES) : {};
    const fieldMap = isCampaignOnly ? cpFieldMap : soFieldMap;

    console.log(`[process-upload] Type: ${detectedType}, Headers: ${headers.length}, Rows: ${jsonRows.length}`);
    console.log(`[process-upload] Field map:`, JSON.stringify(isMixed ? { ...soFieldMap, ...cpFieldMap } : fieldMap));

    // 5. Get project
    const userId = upload.user_id;
    const { data: proj } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    let projectId: string;
    if (!proj) {
      const { data: newProj, error: projErr } = await supabase
        .from("projects")
        .insert({ user_id: userId, name: "Default Project" })
        .select("id")
        .single();
      if (projErr || !newProj) {
        await updateStatus("error", "Could not create project");
        return new Response(
          JSON.stringify({ error: "No project" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      projectId = newProj.id;
    } else {
      projectId = proj.id;
    }

    // 6. Update upload record
    await supabase.from("data_uploads").update({
      column_names: headers,
      data_type: detectedType,
      column_mapping: isMixed ? { ...soFieldMap, ...cpFieldMap } : fieldMap,
      source_type: isCampaignOnly ? "ad_platform" : (isMixed ? "mixed" : "retailer"),
      status: "processing",
      project_id: projectId,
    }).eq("id", uploadId);

    // Field getters
    const getFieldSO = (row: Record<string, unknown>, canonical: string): unknown => {
      const headerKey = soFieldMap[canonical];
      return headerKey ? row[headerKey] : null;
    };
    const getFieldCP = (row: Record<string, unknown>, canonical: string): unknown => {
      const headerKey = cpFieldMap[canonical];
      return headerKey ? row[headerKey] : null;
    };

    // 7. Insert in batches
    await updateStatus("processing", "Inserting data...");
    const BATCH_SIZE = 500;
    let totalInserted = 0;
    let failedRows = 0;
    const failedBatches: string[] = [];

    for (let i = 0; i < jsonRows.length; i += BATCH_SIZE) {
      const batch = jsonRows.slice(i, i + BATCH_SIZE);

      // Insert sell_out_data
      if (types.sell_out) {
        const records = batch.map((row) => ({
          user_id: userId,
          project_id: projectId,
          upload_id: uploadId,
          date: parseDate(getFieldSO(row, "date")) || null,
          product_name_raw: getFieldSO(row, "product_name_raw") ? String(getFieldSO(row, "product_name_raw")) : null,
          sku: getFieldSO(row, "sku") ? String(getFieldSO(row, "sku")) : null,
          retailer: getFieldSO(row, "retailer") ? String(getFieldSO(row, "retailer")) : (upload.source_name || null),
          store_location: getFieldSO(row, "store_location") ? String(getFieldSO(row, "store_location")) : null,
          region: getFieldSO(row, "region") ? String(getFieldSO(row, "region")) : null,
          category: getFieldSO(row, "category") ? String(getFieldSO(row, "category")) : null,
          brand: getFieldSO(row, "brand") ? String(getFieldSO(row, "brand")) : null,
          sub_brand: getFieldSO(row, "sub_brand") ? String(getFieldSO(row, "sub_brand")) : null,
          format_size: getFieldSO(row, "format_size") ? String(getFieldSO(row, "format_size")) : null,
          // Prefer actual_revenue (merchandise sales) over ordered value
          revenue: num(getFieldSO(row, "actual_revenue")) ?? num(getFieldSO(row, "revenue")) ?? null,
          units_sold: num(getFieldSO(row, "units_sold")) ? Math.round(num(getFieldSO(row, "units_sold"))!) : null,
          units_supplied: num(getFieldSO(row, "units_supplied")) ?? null,
          cost: num(getFieldSO(row, "cost")) ?? null,
        }));

        const { error } = await supabase.from("sell_out_data").insert(records);
        if (error) {
          console.error(`[process-upload] Sell-out batch ${Math.floor(i/BATCH_SIZE)+1} error:`, error.message);
          failedRows += records.length;
          failedBatches.push(`SO batch ${Math.floor(i/BATCH_SIZE)+1}: ${error.message}`);
          if (totalInserted === 0 && i === 0 && !types.campaign) {
            await updateStatus("error", `Data insert failed: ${error.message}`);
            return new Response(
              JSON.stringify({ error: error.message }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else {
          totalInserted += records.length;
        }
      }

      // Insert campaign_data_v2
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
          cpm: num(getFieldCP(row, "cpm")) ?? null,
          conversions: num(getFieldCP(row, "conversions")) ? Math.round(num(getFieldCP(row, "conversions"))!) : null,
          revenue: num(getFieldCP(row, "revenue")) ?? null,
          total_sales_attributed: num(getFieldCP(row, "total_sales_attributed")) ?? null,
          total_units_attributed: num(getFieldCP(row, "total_units_attributed")) ? Math.round(num(getFieldCP(row, "total_units_attributed"))!) : null,
          source_format: fileType === "pptx" ? "pptx_spatial" : fileType,
          extraction_confidence: fileType === "pptx" ? 0.8 : 0.95,
        }));

        const { error } = await supabase.from("campaign_data_v2").insert(records);
        if (error) {
          console.error(`[process-upload] Campaign batch ${Math.floor(i/BATCH_SIZE)+1} error:`, error.message);
          failedRows += records.length;
          failedBatches.push(`CP batch ${Math.floor(i/BATCH_SIZE)+1}: ${error.message}`);
          if (totalInserted === 0 && i === 0) {
            await updateStatus("error", `Data insert failed: ${error.message}`);
            return new Response(
              JSON.stringify({ error: error.message }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else {
          if (!types.sell_out) totalInserted += records.length;
        }
      }
    }

    if (failedRows > 0) {
      console.warn(`[process-upload] ${failedRows} rows failed: ${failedBatches.join("; ")}`);
    }

    // 8. Compute metrics
    await updateStatus("processing", "Computing metrics...");

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

    // 9. Finalize
    await updateStatus("processing", "Done!");
    await supabase.from("data_uploads").update({
      status: totalInserted > 0 ? "ready" : "error",
      row_count: totalInserted,
      error_message: totalInserted === 0
        ? `No rows inserted. ${failedRows > 0 ? `${failedRows} rows failed: ${failedBatches[0]}` : "Check column headers."}`
        : (failedRows > 0 ? `${totalInserted} inserted, ${failedRows} failed` : null),
    }).eq("id", uploadId);

    return new Response(
      JSON.stringify({
        message: "Processing complete",
        rowsInserted: totalInserted,
        failedRows,
        detectedType,
        columnsMatched: Object.keys(isMixed ? { ...soFieldMap, ...cpFieldMap } : fieldMap),
        fieldMap: isMixed ? { ...soFieldMap, ...cpFieldMap } : fieldMap,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[process-upload] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
