import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createLogger, generateRequestId } from "../_shared/logger.ts";
import { mapColumns, type FieldMapResult } from "../_shared/column-mapper.ts";
import { toSellOutRecord, toCampaignRecord } from "../_shared/value-transformer.ts";

/* ------------------------------------------------------------------ */
/*  PPTX helpers                                                       */
/* ------------------------------------------------------------------ */

// Label -> campaign schema field mapping for PPTX shapes
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

/* ------------------------------------------------------------------ */
/*  XML parsing helpers                                                */
/* ------------------------------------------------------------------ */

function parseXMLBasic(xml: string): {
  shapes: { x: number; y: number; text: string; isTitle: boolean }[];
  tables: string[][];
} {
  const shapes: { x: number; y: number; text: string; isTitle: boolean }[] = [];
  const tables: string[][] = [];

  // Extract table rows (<a:tbl> -> <a:tr> -> <a:tc> -> <a:t>)
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
    const isTitle = /<p:ph[^>]*type="(?:title|ctrTitle)"/.test(spContent);
    const offMatch = spContent.match(/<a:off\s+x="(\d+)"\s+y="(\d+)"/);
    const x = offMatch ? parseInt(offMatch[1], 10) : 0;
    const y = offMatch ? parseInt(offMatch[2], 10) : 0;
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

/* ------------------------------------------------------------------ */
/*  PPTX Parser                                                        */
/* ------------------------------------------------------------------ */

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

  // Strategy A: Tables
  if (allTableRows.length >= 2) {
    const headers = allTableRows[0];
    const rows = allTableRows.slice(1).map(row => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => { obj[h] = row[i] ?? null; });
      return obj;
    });
    return { headers, rows };
  }

  // Strategy B: Key-Value colon pairs per slide
  const kvSlideRows = extractKVFromShapes(allShapes, slideFiles.length);
  if (kvSlideRows && kvSlideRows.rows.length >= 1) {
    return kvSlideRows;
  }

  // Strategy C: Spatial grouping per slide
  const spatialResult = extractSpatialData(allShapes, slideFiles.length);
  if (spatialResult && spatialResult.rows.length >= 1) {
    return spatialResult;
  }

  // Strategy D: Flat text
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
      const kvMatch = shape.text.match(/^([^:]{1,40}):\s*(.+)$/);
      if (kvMatch) {
        const rawKey = kvMatch[1].trim().toLowerCase();
        const rawValue = kvMatch[2].trim();
        if (rawKey.split(/\s+/).length > 5) continue;
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
  const Y_TOLERANCE = 50000;

  for (let si = 0; si < slideCount; si++) {
    const slideShapes = shapes.filter(s => s.slideIdx === si && !s.isTitle);
    const titleShape = shapes.find(s => s.slideIdx === si && s.isTitle);
    const campaign = titleShape?.text ?? "";
    if (slideShapes.length < 4) continue;

    const sorted = [...slideShapes].sort((a, b) => a.y - b.y || a.x - b.x);
    const yBuckets: { y: number; items: ShapeItem[] }[] = [];
    for (const item of sorted) {
      const bucket = yBuckets.find(b => Math.abs(b.y - item.y) < Y_TOLERANCE);
      if (bucket) bucket.items.push(item);
      else yBuckets.push({ y: item.y, items: [item] });
    }

    const metrics: Record<string, string> = {};
    let platform = "";

    for (const bucket of yBuckets) {
      const cells = bucket.items.sort((a, b) => a.x - b.x).map(i => i.text);

      if (cells.length === 2) {
        const label = cells[0].toLowerCase().replace(/[:\-\u2013\u2014]/g, "").trim();
        const canonical = PPTX_LABEL_MAP[label];
        if (canonical) metrics[canonical] = cells[1].trim();
      }
      if (cells.length === 4 || cells.length === 6) {
        for (let i = 0; i < cells.length - 1; i += 2) {
          const label = cells[i].toLowerCase().replace(/[:\-\u2013\u2014]/g, "").trim();
          const canonical = PPTX_LABEL_MAP[label];
          if (canonical) metrics[canonical] = cells[i + 1].trim();
        }
      }
      if (cells.length === 1) {
        const text = cells[0];
        const kvMatch = text.match(/^([^:]{1,40}):\s*(.+)$/);
        if (kvMatch) {
          const label = kvMatch[1].trim().toLowerCase();
          const canonical = PPTX_LABEL_MAP[label];
          if (canonical) metrics[canonical] = kvMatch[2].trim();
        }
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
  slideRows: { campaign: string; metrics: Record<string, string> }[],
): ParsedResult {
  const allKeys = new Set<string>();
  for (const row of slideRows) {
    for (const key of Object.keys(row.metrics)) allKeys.add(key);
  }
  const metricOrder = [
    "spend", "impressions", "clicks", "ctr", "cpm", "cpc",
    "revenue", "conversions", "units_sold", "roas", "aov",
    "reach", "frequency", "video_views", "platform", "brand", "retailer",
  ];
  const sortedMetrics = [...allKeys].sort((a, b) => {
    const ai = metricOrder.indexOf(a);
    const bi = metricOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  const headers = ["campaign_name", ...sortedMetrics];
  const rows: Record<string, unknown>[] = slideRows.map(sr => {
    const obj: Record<string, unknown> = { campaign_name: sr.campaign || null };
    for (const key of sortedMetrics) obj[key] = sr.metrics[key] ?? null;
    return obj;
  });
  return { headers, rows };
}

/* ------------------------------------------------------------------ */
/*  XLSX Parser (lightweight, JSZip-based)                              */
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

  // 2. Find sheet
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

  // 3. Parse rows
  const parsedRows: { cells: { col: number; value: string }[] }[] = [];
  let maxCol = 0;

  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const cells: { col: number; value: string }[] = [];
    const cellRegex = /<c\s+r="([A-Z]{1,3})(\d+)"([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      const colStr = cellMatch[1];
      const attrs = cellMatch[3] ?? "";
      const content = cellMatch[4] ?? "";
      const col = colToIndex(colStr);
      if (col > maxCol) maxCol = col;

      const typeMatch = attrs.match(/t="([^"]*)"/);
      const type = typeMatch?.[1] ?? "";
      const vMatch = content.match(/<v>([^<]*)<\/v>/);
      const rawVal = vMatch?.[1] ?? "";

      let value = rawVal;
      if (type === "s") {
        const ssIdx = parseInt(rawVal);
        value = (ssIdx >= 0 && ssIdx < sharedStrings.length) ? sharedStrings[ssIdx] : rawVal;
      } else if (type === "inlineStr") {
        const isMatch = content.match(/<is>[\s\S]*?<t[^>]*>([^<]*)<\/t>/);
        value = isMatch?.[1] ?? rawVal;
      } else if (type === "b") {
        value = rawVal === "1" ? "TRUE" : "FALSE";
      } else if (!type && rawVal) {
        const numVal = parseFloat(rawVal);
        if (!isNaN(numVal) && numVal > 40000 && numVal < 55000) {
          const excelEpoch = new Date(1899, 11, 30);
          const d = new Date(excelEpoch.getTime() + numVal * 86400000);
          if (!isNaN(d.getTime())) {
            value = d.toISOString().split("T")[0];
          }
        }
      }
      cells.push({ col, value: value.trim() });
    }
    if (cells.length > 0) parsedRows.push({ cells });
  }

  if (parsedRows.length < 2) throw new Error("XLSX file has no data rows.");

  // 4. Build header + data rows
  const headerCells = parsedRows[0].cells;
  const headers: string[] = new Array(maxCol + 1).fill("");
  for (const c of headerCells) {
    headers[c.col] = c.value || `Column_${c.col + 1}`;
  }
  while (headers.length > 0 && !headers[headers.length - 1]) headers.pop();
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
    if (hasValue) {
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
/*  CSV Parser                                                         */
/* ------------------------------------------------------------------ */

function parseDelimitedRows(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const nextChar = text[i + 1];
      if (inQuotes && nextChar === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === separator) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      cell = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }

  if (inQuotes) {
    throw new Error("Malformed delimited file: unterminated quoted field.");
  }

  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function detectSeparator(headerRow: string): string {
  const separators = [",", "\t", "|", ";"];
  const counts: Record<string, number> = { ",": 0, "\t": 0, "|": 0, ";": 0 };
  let inQuotes = false;

  for (let i = 0; i < headerRow.length; i++) {
    const char = headerRow[i];
    if (char === '"') {
      const nextChar = headerRow[i + 1];
      if (inQuotes && nextChar === '"') i++;
      else inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && separators.includes(char)) {
      counts[char] += 1;
    }
  }

  let best = ",";
  for (const candidate of separators) {
    if (counts[candidate] > counts[best]) best = candidate;
  }
  return counts[best] > 0 ? best : ",";
}

function parseCSV(text: string, separator = ","): ParsedResult {
  const parsedRows = parseDelimitedRows(text, separator);
  if (parsedRows.length < 2) throw new Error("Delimited file has no data rows.");

  const headers = parsedRows[0].map((h) => h.replace(/^\uFEFF/, "").trim().replace(/^["']|["']$/g, ""));
  const rows = parsedRows.slice(1).map((values) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? null; });
    return obj;
  });

  return { headers, rows };
}

/* ------------------------------------------------------------------ */
/*  Main handler                                                       */
/* ------------------------------------------------------------------ */

Deno.serve(async (req) => {
  // CORS preflight
  const preflightResp = handleCors(req);
  if (preflightResp) return preflightResp;

  const requestId = generateRequestId();
  const log = createLogger("process-upload", requestId);
  const startTime = Date.now();

  try {
    const { uploadId } = await req.json();
    if (!uploadId) {
      return new Response(
        JSON.stringify({ error: "uploadId is required" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // ── Auth ──
    const auth = await authenticateRequest(req);
    if (!auth) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Helper to update status with progress message
    const updateStatus = async (status: string, message?: string, extra?: Record<string, unknown>) => {
      await supabase.from("data_uploads").update({
        status,
        error_message: message ?? null,
        ...extra,
      }).eq("id", uploadId);
    };

    // ── 1. Fetch upload record ──
    const { data: upload, error: fetchErr } = await supabase
      .from("data_uploads")
      .select("*")
      .eq("id", uploadId)
      .single();

    if (fetchErr || !upload) {
      log.warn("Upload not found", { uploadId });
      return new Response(
        JSON.stringify({ error: "Upload not found" }),
        { status: 404, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    if (upload.user_id !== auth.userId) {
      log.warn("Unauthorized access attempt", { uploadId, requestUserId: auth.userId, ownerUserId: upload.user_id });
      return new Response(
        JSON.stringify({ error: "Not authorized" }),
        { status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    log.info("Processing upload", { uploadId, fileName: upload.file_name, fileType: upload.file_type });

    // ── 1b. Download file early for SHA-256 hashing ──
    await updateStatus("processing", "Parsing file...");
    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from("uploads")
      .download(upload.storage_path);

    if (dlErr || !fileBlob) {
      await updateStatus("error", "Failed to download file from storage");
      log.error("Download failed", { uploadId, error: dlErr?.message });
      return new Response(
        JSON.stringify({ error: "Download failed" }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // ── Fire 4: SHA-256 content hash deduplication ──
    const fileBuffer = await fileBlob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", fileBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fileHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    // Store hash on the upload record
    await supabase.from("data_uploads").update({ file_hash: fileHash }).eq("id", uploadId);

    // Check for existing upload with same hash
    const dupeFilter = supabase
      .from("data_uploads")
      .select("id")
      .eq("file_hash", fileHash)
      .eq("status", "ready")
      .neq("id", uploadId);

    if (upload.project_id) {
      dupeFilter.eq("project_id", upload.project_id);
    } else {
      dupeFilter.eq("user_id", upload.user_id);
    }

    const { data: dupes } = await dupeFilter;
    if (dupes && dupes.length > 0) {
      await updateStatus("error", `Duplicate file: content matches an already-processed upload.`);
      log.warn("Duplicate file rejected (SHA-256)", { uploadId, fileHash, existingId: dupes[0].id });
      return new Response(
        JSON.stringify({ error: "Duplicate file already processed", existingUploadId: dupes[0].id }),
        { status: 409, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }


    // ── 3. Parse file (already downloaded above for hashing) ──
    // Re-create blob from the arrayBuffer we already have
    const parsableBlob = new Blob([fileBuffer]);
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
        const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
        const separator = fileType === "tsv" || fileType === "tab" ? "\t" : detectSeparator(firstLine);
        const result = parseCSV(text, separator);
        headers = result.headers;
        jsonRows = result.rows;
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
          { headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
        );
      }
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : "Parse failed";
      await updateStatus("error", msg);
      log.error("Parse failed", { uploadId, fileType, error: msg });
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    if (headers.length === 0 || jsonRows.length === 0) {
      await updateStatus("error", "No data found in file");
      return new Response(
        JSON.stringify({ error: "No data in file" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Row limit
    const MAX_ROWS = 200_000;
    if (jsonRows.length > MAX_ROWS) {
      await updateStatus("error", `File exceeds ${MAX_ROWS.toLocaleString()} row limit (found ${jsonRows.length.toLocaleString()} rows).`);
      return new Response(
        JSON.stringify({ error: "Row limit exceeded" }),
        { status: 413, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // ── 4. Detect type & map columns (using shared column-mapper) ──
    await updateStatus("processing", "Classifying columns...");
    const mapping: FieldMapResult = mapColumns(headers);

    log.info("Column mapping complete", {
      uploadId,
      dataType: mapping.dataType,
      headersCount: headers.length,
      rowCount: jsonRows.length,
      mappedFields: Object.keys(mapping.combinedFieldMap).length,
      confidence: mapping.confidence,
    });

    // ── 5. Get project ──
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
          { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
        );
      }
      projectId = newProj.id;
    } else {
      projectId = proj.id;
    }

    // ── 6. Update upload record with mapping info ──
    await supabase.from("data_uploads").update({
      column_names: headers,
      data_type: mapping.dataType,
      column_mapping: mapping.combinedFieldMap,
      source_type: mapping.dataType === "campaign" ? "ad_platform" : (mapping.dataType === "mixed" ? "mixed" : "retailer"),
      status: "processing",
      project_id: projectId,
    }).eq("id", uploadId);

    // ── 7. Insert in batches (using shared value-transformer) ──
    await updateStatus("processing", "Inserting data...");
    const BATCH_SIZE = 500;
    let totalInserted = 0;
    let failedRows = 0;
    const failedBatches: string[] = [];

    const isSellOut = mapping.dataType === "sell_out" || mapping.dataType === "mixed";
    const isCampaign = mapping.dataType === "campaign" || mapping.dataType === "mixed";
    const soFieldMap = mapping.soFieldMap;
    const cpFieldMap = mapping.cpFieldMap;

    for (let i = 0; i < jsonRows.length; i += BATCH_SIZE) {
      const batch = jsonRows.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      // Insert sell_out_data
      if (isSellOut) {
        const records = batch.map((row) =>
          toSellOutRecord(row, soFieldMap, uploadId, userId, projectId, upload.source_name),
        );

        const { error } = await supabase.from("sell_out_data").insert(records);
        if (error) {
          log.warn(`Sell-out batch ${batchNum} error`, { error: error.message });
          failedRows += records.length;
          failedBatches.push(`SO batch ${batchNum}: ${error.message}`);
          if (totalInserted === 0 && i === 0 && !isCampaign) {
            await updateStatus("error", `Data insert failed: ${error.message}`);
            return new Response(
              JSON.stringify({ error: error.message }),
              { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
            );
          }
        } else {
          totalInserted += records.length;
        }
      }

      // Insert campaign_data_v2
      if (isCampaign) {
        const extractionConfidence = fileType === "pptx" ? 0.8 : 0.95;
        const sourceFormat = fileType === "pptx" ? "pptx_spatial" : fileType;
        const records = batch.map((row) =>
          toCampaignRecord(row, cpFieldMap, uploadId, userId, projectId, sourceFormat, extractionConfidence),
        );

        const { error } = await supabase.from("campaign_data_v2").insert(records);
        if (error) {
          log.warn(`Campaign batch ${batchNum} error`, { error: error.message });
          failedRows += records.length;
          failedBatches.push(`CP batch ${batchNum}: ${error.message}`);
          if (totalInserted === 0 && i === 0) {
            await updateStatus("error", `Data insert failed: ${error.message}`);
            return new Response(
              JSON.stringify({ error: error.message }),
              { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
            );
          }
        } else {
          if (!isSellOut) totalInserted += records.length;
        }
      }
    }

    if (failedRows > 0) {
      log.warn(`${failedRows} rows failed`, { failedBatches });
    }

    // ── 8. Compute metrics ──
    await updateStatus("processing", "Computing metrics...");

    if (isSellOut && totalInserted > 0) {
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

    // ── 9. Finalize ──
    await supabase.from("data_uploads").update({
      status: totalInserted > 0 ? "ready" : "error",
      row_count: totalInserted,
      error_message: totalInserted === 0
        ? `No rows inserted. ${failedRows > 0 ? `${failedRows} rows failed: ${failedBatches[0]}` : "Check column headers."}`
        : (failedRows > 0 ? `${totalInserted} inserted, ${failedRows} failed` : null),
    }).eq("id", uploadId);

    const duration = Date.now() - startTime;
    log.info("Processing complete", {
      uploadId,
      rowsInserted: totalInserted,
      failedRows,
      dataType: mapping.dataType,
      durationMs: duration,
    });

    return new Response(
      JSON.stringify({
        message: "Processing complete",
        rowsInserted: totalInserted,
        failedRows,
        detectedType: mapping.dataType,
        columnsMatched: Object.keys(mapping.combinedFieldMap),
        fieldMap: mapping.combinedFieldMap,
      }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (err) {
    log.error("Unhandled error", { error: String(err) });
    return new Response(
      JSON.stringify({ error: "Internal error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});
