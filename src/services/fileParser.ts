/**
 * fileParser.ts — Lossless file parser
 *
 * Turns any supported file into headers + string rows.
 * ALL values are strings. No type conversion happens here.
 * Row count out MUST equal row count in the source.
 */

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;          // must equal rows.length — explicit for audit
  fileType: string;
  warnings: string[];        // non-fatal issues (empty rows skipped, etc.)
}

/* ------------------------------------------------------------------ */
/*  CSV / TSV Parser                                                   */
/* ------------------------------------------------------------------ */

export function parseCSV(text: string, filename: string): ParsedFile {
  const warnings: string[] = [];

  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  const sep = ext === "tsv" || ext === "tab" ? "\t" : detectSeparator(firstLine);

  const parsedRows = parseDelimitedRows(text, sep);
  if (parsedRows.length < 2) {
    throw new Error(`File has ${parsedRows.length} non-empty rows. Need at least 2 (header + 1 data row).`);
  }

  const headers = parsedRows[0].map((header) => header.replace(/^\uFEFF/, ""));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < parsedRows.length; i++) {
    const values = parsedRows[i];
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j] ?? "";
    }
    rows.push(obj);
  }

  return {
    headers,
    rows,
    rowCount: rows.length,
    fileType: sep === "\t" ? "tsv" : "csv",
    warnings,
  };
}

function parseDelimitedRows(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      const nextChar = text[i + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === sep) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(current.trim());
      current = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      continue;
    }

    current += char;
  }

  if (inQuotes) {
    throw new Error("Malformed delimited file: unterminated quoted field.");
  }

  row.push(current.trim());
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
      if (inQuotes && nextChar === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
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

/* ------------------------------------------------------------------ */
/*  XLSX Parser (uses xlsx library in browser — full memory available)  */
/* ------------------------------------------------------------------ */

export async function parseXLSX(file: File): Promise<ParsedFile> {
  const XLSX = await import("xlsx");
  const warnings: string[] = [];
  const buffer = await file.arrayBuffer();

  const workbook = XLSX.read(new Uint8Array(buffer), {
    type: "array",
    cellDates: false,    // keep dates as raw values — we convert later
    cellNF: true,        // preserve number formats
    cellText: false,     // don't auto-format — we want raw values
    raw: true,           // raw cell values, no formatting
  });

  if (workbook.SheetNames.length === 0) {
    throw new Error("Workbook has no sheets.");
  }

  if (workbook.SheetNames.length > 1) {
    warnings.push(`Workbook has ${workbook.SheetNames.length} sheets. Using first sheet: "${workbook.SheetNames[0]}".`);
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  const totalDataRows = range.e.r; // 0-indexed, so this is the count of data rows (excluding header)

  // Convert to JSON with raw values, all as strings
  const jsonRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: "",      // empty cells become ""
    raw: true,       // raw values
    dateNF: "yyyy-mm-dd",  // date format hint
  });

  if (jsonRows.length === 0) {
    throw new Error("Sheet has no data rows.");
  }

  // Get headers
  const headers = Object.keys(jsonRows[0]);

  // Convert ALL values to strings for consistency
  const rows: Record<string, string>[] = jsonRows.map(row => {
    const strRow: Record<string, string> = {};
    for (const h of headers) {
      const val = row[h];
      if (val === null || val === undefined) {
        strRow[h] = "";
      } else if (val instanceof Date) {
        strRow[h] = val.toISOString().split("T")[0];
      } else {
        strRow[h] = String(val);
      }
    }
    return strRow;
  });

  // Audit: check row count matches
  if (rows.length !== jsonRows.length) {
    warnings.push(`Row count mismatch: xlsx library returned ${jsonRows.length}, string conversion produced ${rows.length}.`);
  }

  return {
    headers,
    rows,
    rowCount: rows.length,
    fileType: "xlsx",
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/*  PPTX Parser — text extraction only                                 */
/* ------------------------------------------------------------------ */

export interface PPTXSlide {
  slideNumber: number;
  title: string;
  textBlocks: string[];   // each shape's text as a separate block
  notes: string;
  rawText: string;        // all text concatenated
}

export interface ParsedPPTX {
  slides: PPTXSlide[];
  fullText: string;       // all slides concatenated
  slideCount: number;
  warnings: string[];
}

export async function parsePPTX(file: File): Promise<ParsedPPTX> {
  const JSZip = (await import("jszip")).default;
  const warnings: string[] = [];

  const zip = await JSZip.loadAsync(await file.arrayBuffer());

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

  const slides: PPTXSlide[] = [];
  const allText: string[] = [];

  for (let si = 0; si < slideFiles.length; si++) {
    const xml = await zip.files[slideFiles[si]].async("text");

    // Extract text blocks from shapes using string splitting (not regex)
    const textBlocks: string[] = [];
    let title = "";

    // Helper: extract all <a:t> text from an XML chunk
    const extractTextFromChunk = (chunk: string): string[] => {
      const parts: string[] = [];
      const tChunks = chunk.split("<a:t>");
      for (let j = 1; j < tChunks.length; j++) {
        const tEnd = tChunks[j].indexOf("</a:t>");
        if (tEnd !== -1) {
          const text = tChunks[j].substring(0, tEnd).trim();
          if (text) parts.push(text);
        }
      }
      return parts;
    };

    // Extract from standard shapes (<p:sp>), which include auto shapes and text boxes
    const shapeChunks = xml.split("<p:sp>");
    for (let i = 1; i < shapeChunks.length; i++) {
      const endIdx = shapeChunks[i].indexOf("</p:sp>");
      const shapeXml = endIdx !== -1 ? shapeChunks[i].substring(0, endIdx) : shapeChunks[i];

      // Check if this is a title shape
      const isTitle = shapeXml.includes('type="title"') || shapeXml.includes('type="ctrTitle"');

      const textParts = extractTextFromChunk(shapeXml);
      const shapeText = textParts.join(" ").trim();
      if (shapeText) {
        textBlocks.push(shapeText);
        if (isTitle && !title) title = shapeText;
      }
    }

    // Also extract from group shapes (<p:grpSp>) which may contain nested text
    const grpChunks = xml.split("<p:grpSp>");
    for (let i = 1; i < grpChunks.length; i++) {
      const endIdx = grpChunks[i].indexOf("</p:grpSp>");
      const grpXml = endIdx !== -1 ? grpChunks[i].substring(0, endIdx) : grpChunks[i];
      const textParts = extractTextFromChunk(grpXml);
      const grpText = textParts.join(" ").trim();
      if (grpText && !textBlocks.includes(grpText)) {
        textBlocks.push(grpText);
      }
    }

    // Also extract from graphic frames (<p:graphicFrame>) which may contain tables
    const gfChunks = xml.split("<p:graphicFrame>");
    for (let i = 1; i < gfChunks.length; i++) {
      const endIdx = gfChunks[i].indexOf("</p:graphicFrame>");
      const gfXml = endIdx !== -1 ? gfChunks[i].substring(0, endIdx) : gfChunks[i];
      const textParts = extractTextFromChunk(gfXml);
      const gfText = textParts.join(" ").trim();
      if (gfText && !textBlocks.includes(gfText)) {
        textBlocks.push(gfText);
      }
    }

    // Extract notes
    let notes = "";
    const notesFile = zip.files[`ppt/notesSlides/notesSlide${si + 1}.xml`];
    if (notesFile) {
      const notesXml = await notesFile.async("text");
      const notesParts: string[] = [];
      const nChunks = notesXml.split("<a:t>");
      for (let j = 1; j < nChunks.length; j++) {
        const nEnd = nChunks[j].indexOf("</a:t>");
        if (nEnd !== -1) {
          const t = nChunks[j].substring(0, nEnd).trim();
          if (t) notesParts.push(t);
        }
      }
      notes = notesParts.join(" ").trim();
    }

    const rawText = textBlocks.join("\n");
    if (textBlocks.length > 0) {
      slides.push({
        slideNumber: si + 1,
        title,
        textBlocks,
        notes,
        rawText,
      });
      allText.push(`--- Slide ${si + 1}${title ? `: ${title}` : ""} ---\n${rawText}`);
    }
  }

  if (slides.length === 0) {
    warnings.push("No text content found in any slide.");
  }

  return {
    slides,
    fullText: allText.join("\n\n"),
    slideCount: slideFiles.length,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/*  Master parse function                                              */
/* ------------------------------------------------------------------ */

export type ParseResult =
  | { type: "tabular"; data: ParsedFile }
  | { type: "presentation"; data: ParsedPPTX };

export async function parseFile(file: File): Promise<ParseResult> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  switch (ext) {
    case "csv":
    case "tsv":
    case "txt":
    case "tab": {
      const text = await file.text();
      return { type: "tabular", data: parseCSV(text, file.name) };
    }
    case "xlsx":
    case "xls": {
      return { type: "tabular", data: await parseXLSX(file) };
    }
    case "pptx": {
      return { type: "presentation", data: await parsePPTX(file) };
    }
    default:
      throw new Error(`Unsupported file type: .${ext}. Supported: CSV, XLSX, XLS, TSV, TXT, PPTX.`);
  }
}
