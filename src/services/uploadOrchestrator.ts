/**
 * uploadOrchestrator.ts — Enterprise upload pipeline
 *
 * Connects: parseFile → mapColumns → transform → insert → verify
 * Tracks row counts at every stage for audit.
 */

import { supabase } from "@/integrations/supabase/client";
import { parseFile, type ParseResult, type ParsedFile, type ParsedPPTX } from "./fileParser";
import { mapColumns, type ColumnMapping, type DataType } from "./columnMapper";
import { toSellOutRecord, toCampaignRecord } from "./valueTransformer";
// Learning pipeline is now called once after all uploads complete (in UploadPage.tsx)

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface UploadAudit {
  fileRowCount: number;     // rows found by parser
  mappedRowCount: number;   // rows that had at least one field mapped
  attemptedInserts: number; // rows sent to Supabase
  successfulInserts: number;// rows confirmed inserted
  failedInserts: number;    // rows that errored on insert
  failedBatches: string[];  // error messages from failed batches
  warnings: string[];       // non-fatal issues
}

export interface UploadResult {
  success: boolean;
  dataType: DataType;
  audit: UploadAudit;
  mapping: ColumnMapping;
  error?: string;
}

export type ProgressCallback = (p: { percent: number; stage: string }) => void;

/* ------------------------------------------------------------------ */
/*  PPTX → Campaign extraction via LLM                                 */
/* ------------------------------------------------------------------ */

async function extractCampaignFromPPTX(
  pptx: ParsedPPTX,
  fileName?: string,
): Promise<{ mapping: ColumnMapping; rows: Record<string, string>[] } | null> {
  try {
    const { data, error } = await supabase.functions.invoke("ai-extract-campaign", {
      body: { slideTexts: pptx.fullText, fileName: fileName ?? "" },
    });

    if (error || !data) return null;

    const parsed = typeof data === "string" ? JSON.parse(data) : data;
    if (!parsed.rows || !Array.isArray(parsed.rows) || parsed.rows.length === 0) return null;

    // Convert LLM output to our standard format: string-value rows with headers
    const headers = Object.keys(parsed.rows[0]);
    const rows: Record<string, string>[] = parsed.rows.map((r: any) => {
      const row: Record<string, string> = {};
      for (const h of headers) {
        row[h] = r[h] !== null && r[h] !== undefined ? String(r[h]) : "";
      }
      return row;
    });

    // Build a direct mapping (LLM output fields = canonical fields)
    const fieldMap: Record<string, string> = {};
    const campaignFields = ["campaign_name", "platform", "channel", "spend", "impressions",
      "clicks", "ctr", "cpm", "conversions", "revenue", "roas",
      "total_sales_attributed", "total_units_attributed", "flight_start", "flight_end"];

    // Map LLM's camelCase to our snake_case canonical fields
    const camelToSnake: Record<string, string> = {
      campaignName: "campaign_name", platform: "platform", channel: "channel",
      spend: "spend", impressions: "impressions", clicks: "clicks",
      ctr: "ctr", cpm: "cpm", conversions: "conversions", revenue: "revenue",
      roas: "roas", flightStart: "flight_start", flightEnd: "flight_end",
      totalSalesAttributed: "total_sales_attributed",
      totalUnitsAttributed: "total_units_attributed",
      // Legacy aliases the LLM might still use
      unitsSold: "total_units_attributed",
      flight_start: "flight_start", flight_end: "flight_end",
    };

    for (const h of headers) {
      const canonical = camelToSnake[h] ?? h;
      if (campaignFields.includes(canonical)) {
        fieldMap[canonical] = h;
      }
    }

    return {
      mapping: {
        dataType: "campaign",
        confidence: 0.85,
        fieldMap,
        unmappedColumns: [],
        source: "llm",
      },
      rows,
    };
  } catch (err) {
    console.error("[orchestrator] PPTX LLM extraction failed:", err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Main orchestrator                                                  */
/* ------------------------------------------------------------------ */

export async function orchestrateUpload(
  file: File,
  uploadId: string,
  userId: string,
  sourceName: string | null,
  onProgress: ProgressCallback,
): Promise<UploadResult> {

  const audit: UploadAudit = {
    fileRowCount: 0,
    mappedRowCount: 0,
    attemptedInserts: 0,
    successfulInserts: 0,
    failedInserts: 0,
    failedBatches: [],
    warnings: [],
  };

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  // ══════════════════════════════════════════════════
  //  STEP 1: PARSE
  // ══════════════════════════════════════════════════
  onProgress({ percent: 10, stage: "Parsing file..." });

  let parseResult: ParseResult;
  try {
    parseResult = await parseFile(file);
  } catch (err: any) {
    return {
      success: false,
      dataType: "unknown",
      audit,
      mapping: { dataType: "unknown", confidence: 0, fieldMap: {}, unmappedColumns: [], source: "local" },
      error: `Parse failed: ${err.message}`,
    };
  }

  // ══════════════════════════════════════════════════
  //  STEP 2: MAP COLUMNS
  // ══════════════════════════════════════════════════
  onProgress({ percent: 25, stage: "Mapping columns..." });

  let mapping: ColumnMapping;
  let dataRows: Record<string, string>[];
  let headers: string[];

  if (parseResult.type === "tabular") {
    const parsed = parseResult.data;
    audit.fileRowCount = parsed.rowCount;
    audit.warnings.push(...parsed.warnings);
    headers = parsed.headers;
    dataRows = parsed.rows;

    onProgress({ percent: 30, stage: `Parsed ${parsed.rowCount.toLocaleString()} rows. Detecting schema...` });

    // Map columns (local + optional LLM)
    mapping = await mapColumns(headers, dataRows.slice(0, 5));

    if (mapping.dataType === "unknown") {
      await supabase.from("data_uploads").update({
        status: "error",
        error_message: `Could not identify data type. Mapped ${Object.keys(mapping.fieldMap).length} of ${headers.length} columns. Unmapped: ${mapping.unmappedColumns.join(", ")}`,
        column_names: headers,
        data_type: "unknown",
      }).eq("id", uploadId);

      return {
        success: false,
        dataType: "unknown",
        audit,
        mapping,
        error: "Could not detect data type from column headers.",
      };
    }

  } else {
    // PPTX: extract via LLM
    const pptx = parseResult.data;
    audit.warnings.push(...pptx.warnings);

    onProgress({ percent: 30, stage: `Extracted text from ${pptx.slideCount} slides. AI extracting campaign data...` });

    const llmResult = await extractCampaignFromPPTX(pptx, file.name);

    console.log(`[orchestrator] PPTX extraction result:`, llmResult ? `${llmResult.rows.length} rows, fields: ${Object.keys(llmResult.mapping.fieldMap).join(", ")}` : "null");
    if (llmResult?.rows?.[0]) {
      console.log(`[orchestrator] PPTX sample row:`, JSON.stringify(llmResult.rows[0]));
    }

    if (!llmResult || llmResult.rows.length === 0) {
      await supabase.from("data_uploads").update({
        status: "error",
        error_message: "Could not extract structured campaign data from this presentation. Try exporting metrics to CSV/XLSX.",
      }).eq("id", uploadId);

      return {
        success: false,
        dataType: "unknown",
        audit,
        mapping: { dataType: "unknown", confidence: 0, fieldMap: {}, unmappedColumns: [], source: "local" },
        error: "PPTX extraction failed. No campaign metrics found.",
      };
    }

    mapping = llmResult.mapping;
    dataRows = llmResult.rows;
    headers = Object.keys(dataRows[0] ?? {});
    audit.fileRowCount = dataRows.length;
  }

  // ══════════════════════════════════════════════════
  //  STEP 3: GET PROJECT
  // ══════════════════════════════════════════════════
  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  let projectId = projects?.[0]?.id;
  if (!projectId) {
    const { data: newProj } = await supabase
      .from("projects")
      .insert({ user_id: userId, name: "Default Project" })
      .select("id")
      .single();
    projectId = newProj?.id;
  }
  if (!projectId) {
    return { success: false, dataType: mapping.dataType, audit, mapping, error: "No project found." };
  }

  // ══════════════════════════════════════════════════
  //  STEP 4: TRANSFORM & INSERT
  // ══════════════════════════════════════════════════
  onProgress({ percent: 40, stage: `Inserting ${dataRows.length.toLocaleString()} rows...` });

  const BATCH_SIZE = 500;
  const CONCURRENCY = 3; // Run 3 batch inserts in parallel — 3x faster
  const isSellOut = mapping.dataType === "sell_out" || mapping.dataType === "mixed";
  const isCampaign = mapping.dataType === "campaign" || mapping.dataType === "mixed";

  // Diagnostic logging
  console.log(`[orchestrator] Data type: ${mapping.dataType}, Source: ${mapping.source}, Confidence: ${mapping.confidence}`);
  console.log(`[orchestrator] Field mapping:`, JSON.stringify(mapping.fieldMap));
  console.log(`[orchestrator] Unmapped columns:`, mapping.unmappedColumns);

  if (isSellOut && dataRows.length > 0) {
    const sampleTransformed = toSellOutRecord(dataRows[0], mapping, uploadId, userId, projectId!, sourceName);
    console.log(`[orchestrator] Sample sell-out record:`, JSON.stringify(sampleTransformed));
  }

  // Build all batches upfront, then process in parallel waves
  const batches: { start: number; rows: Record<string, string>[] }[] = [];
  for (let i = 0; i < dataRows.length; i += BATCH_SIZE) {
    batches.push({ start: i, rows: dataRows.slice(i, i + BATCH_SIZE) });
  }

  let insertedSoFar = 0;

  for (let w = 0; w < batches.length; w += CONCURRENCY) {
    const wave = batches.slice(w, w + CONCURRENCY);

    const promises = wave.map(async ({ start, rows: batch }) => {
      const batchNum = Math.floor(start / BATCH_SIZE) + 1;

      if (isSellOut) {
        const records = batch.map(row =>
          toSellOutRecord(row, mapping, uploadId, userId, projectId!, sourceName)
        );
        audit.attemptedInserts += records.length;

        const { error } = await supabase.from("sell_out_data").insert(records as any);
        if (error) {
          audit.failedInserts += records.length;
          audit.failedBatches.push(`sell_out batch ${batchNum}: ${error.message}`);
        } else {
          audit.successfulInserts += records.length;
        }
      }

      if (isCampaign) {
        const records = batch.map(row =>
          toCampaignRecord(row, mapping, uploadId, userId, projectId!, ext)
        );
        audit.attemptedInserts += records.length;

        const { error } = await supabase.from("campaign_data_v2").insert(records as any);
        if (error) {
          audit.failedInserts += records.length;
          audit.failedBatches.push(`campaign batch ${batchNum}: ${error.message}`);
        } else {
          audit.successfulInserts += records.length;
        }
      }

      return batch.length;
    });

    const results = await Promise.all(promises);
    insertedSoFar += results.reduce((s, n) => s + n, 0);

    // Progress — update once per wave, not per batch
    const pct = 40 + Math.round((insertedSoFar / dataRows.length) * 45);
    onProgress({ percent: pct, stage: `Inserted ${insertedSoFar.toLocaleString()} of ${dataRows.length.toLocaleString()} rows` });
  }

  // ══════════════════════════════════════════════════
  //  STEP 5: VERIFY & UPDATE
  // ══════════════════════════════════════════════════
  onProgress({ percent: 90, stage: "Verifying..." });

  // Audit check
  audit.mappedRowCount = dataRows.length;

  if (audit.fileRowCount !== audit.mappedRowCount) {
    audit.warnings.push(`Row count drift: parsed ${audit.fileRowCount}, mapped ${audit.mappedRowCount}`);
  }
  if (audit.attemptedInserts !== audit.successfulInserts + audit.failedInserts) {
    audit.warnings.push(`Insert count mismatch: attempted ${audit.attemptedInserts}, success ${audit.successfulInserts} + failed ${audit.failedInserts}`);
  }

  // Update upload record
  const { error: updateError } = await supabase.from("data_uploads").update({
    status: audit.successfulInserts > 0 ? "ready" : "error",
    row_count: audit.fileRowCount,  // Store total file rows for accurate reporting
    data_type: mapping.dataType,
    column_names: headers,
    column_mapping: mapping.fieldMap,
    project_id: projectId,
    error_message: audit.failedInserts > 0
      ? `${audit.successfulInserts} of ${audit.fileRowCount} rows inserted, ${audit.failedInserts} failed. ${audit.failedBatches[0] ?? ""}`
      : (audit.warnings.length > 0 ? audit.warnings.join("; ") : null),
  }).eq("id", uploadId);

  if (updateError) {
    console.error("[orchestrator] Failed to update upload status:", updateError.message);
  }

  // ══════════════════════════════════════════════════
  //  STEP 6: POST-PROCESSING
  // ══════════════════════════════════════════════════
  onProgress({ percent: 95, stage: "Finalizing..." });

  // Learning pipeline is triggered once after all uploads complete (UploadPage.tsx uploadAll)

  console.log(`[orchestrator] Upload complete:`, JSON.stringify(audit));

  return {
    success: audit.successfulInserts > 0,
    dataType: mapping.dataType,
    audit,
    mapping,
  };
}
