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
  const rawLines = text.split(/\r?\n/);
  const nonEmptyLines = rawLines.filter(l => l.trim().length > 0);

  if (nonEmptyLines.length < 2) {
    throw new Error(`File has ${nonEmptyLines.length} non-empty lines. Need at least 2 (header + 1 data row).`);
  }

  if (rawLines.length !== nonEmptyLines.length) {
    warnings.push(`Skipped ${rawLines.length - nonEmptyLines.length} empty lines.`);
  }

  // Detect separator from first line
  const first = nonEmptyLines[0];
  const tabCount = (first.match(/\t/g) || []).length;
  const commaCount = (first.match(/,/g) || []).length;
  const pipeCount = (first.match(/\|/g) || []).length;
  const sep = tabCount > commaCount && tabCount > pipeCount ? "\t"
    : pipeCount > commaCount ? "|" : ",";

  const headers = splitLine(nonEmptyLines[0], sep);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < nonEmptyLines.length; i++) {
    const values = splitLine(nonEmptyLines[i], sep);
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
    fileType: "csv",
    warnings,
  };
}

function splitLine(line: string, sep: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';  // escaped quote
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === sep && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
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
  const jsonRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, {
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

    // Split by shape boundaries
    const shapeChunks = xml.split("<p:sp>");
    for (let i = 1; i < shapeChunks.length; i++) {
      const endIdx = shapeChunks[i].indexOf("</p:sp>");
      const shapeXml = endIdx !== -1 ? shapeChunks[i].substring(0, endIdx) : shapeChunks[i];

      // Check if this is a title shape
      const isTitle = shapeXml.includes('type="title"') || shapeXml.includes('type="ctrTitle"');

      // Extract text from <a:t> tags using split
      const textParts: string[] = [];
      const tChunks = shapeXml.split("<a:t>");
      for (let j = 1; j < tChunks.length; j++) {
        const tEnd = tChunks[j].indexOf("</a:t>");
        if (tEnd !== -1) {
          const text = tChunks[j].substring(0, tEnd).trim();
          if (text) textParts.push(text);
        }
      }

      const shapeText = textParts.join(" ").trim();
      if (shapeText) {
        textBlocks.push(shapeText);
        if (isTitle && !title) title = shapeText;
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
