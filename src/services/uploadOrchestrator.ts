/**
 * uploadOrchestrator.ts — Enterprise upload pipeline
 *
 * Connects: parseFile → mapColumns → transform → insert → verify
 * Tracks row counts at every stage for audit.
 */

import { supabase } from "@/integrations/supabase/client";
import { parseFile, type ParseResult, type ParsedPPTX } from "./fileParser";
import { mapColumns, type ColumnMapping, type DataType } from "./columnMapper";
import { toSellOutRecord, toCampaignRecord } from "./valueTransformer";
import { audit } from "@/lib/audit-client";
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
/*  Resolve project ID — call once before concurrent uploads           */
/* ------------------------------------------------------------------ */

export async function resolveProjectId(userId: string): Promise<string | null> {
  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (projects?.[0]?.id) return projects[0].id;

  // No project exists — create one
  const { data: newProj } = await supabase
    .from("projects")
    .insert({ user_id: userId, name: "Default Project" })
    .select("id")
    .single();

  return newProj?.id ?? null;
}

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
  /** Pre-resolved project ID — avoids race conditions in concurrent uploads */
  preResolvedProjectId?: string,
): Promise<UploadResult> {

  const auditData: UploadAudit = {
    fileRowCount: 0,
    mappedRowCount: 0,
    attemptedInserts: 0,
    successfulInserts: 0,
    failedInserts: 0,
    failedBatches: [],
    warnings: [],
  };

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  audit({ action: "data.upload_start", meta: { fileName: file.name, fileSize: file.size, ext }, resourceId: uploadId, resourceType: "data_upload" });

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
      audit: auditData,
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
    auditData.fileRowCount = parsed.rowCount;
    auditData.warnings.push(...parsed.warnings);
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
        audit: auditData,
        mapping,
        error: "Could not detect data type from column headers.",
      };
    }

  } else {
    // PPTX: extract via LLM
    const pptx = parseResult.data;
    auditData.warnings.push(...pptx.warnings);

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
        audit: auditData,
        mapping: { dataType: "unknown", confidence: 0, fieldMap: {}, unmappedColumns: [], source: "local" },
        error: "PPTX extraction failed. No campaign metrics found.",
      };
    }

    mapping = llmResult.mapping;
    dataRows = llmResult.rows;
    headers = Object.keys(dataRows[0] ?? {});
    auditData.fileRowCount = dataRows.length;
  }

  // ══════════════════════════════════════════════════
  //  STEP 3: GET PROJECT
  //  Use pre-resolved ID to prevent race conditions
  //  when multiple files upload concurrently.
  // ══════════════════════════════════════════════════
  let projectId = preResolvedProjectId;
  if (!projectId) {
    const { data: projects } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);
    projectId = projects?.[0]?.id;
    if (!projectId) {
      const { data: newProj } = await supabase
        .from("projects")
        .insert({ user_id: userId, name: "Default Project" })
        .select("id")
        .single();
      projectId = newProj?.id;
    }
  }
  if (!projectId) {
    return { success: false, dataType: mapping.dataType, audit: auditData, mapping, error: "No project found." };
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
        auditData.attemptedInserts += records.length;

        const { error } = await supabase.from("sell_out_data").insert(records as any);
        if (error) {
          auditData.failedInserts += records.length;
          auditData.failedBatches.push(`sell_out batch ${batchNum}: ${error.message}`);
        } else {
          auditData.successfulInserts += records.length;
        }
      }

      if (isCampaign) {
        const records = batch.map(row =>
          toCampaignRecord(row, mapping, uploadId, userId, projectId!, ext)
        );
        auditData.attemptedInserts += records.length;

        const { error } = await supabase.from("campaign_data_v2").insert(records as any);
        if (error) {
          auditData.failedInserts += records.length;
          auditData.failedBatches.push(`campaign batch ${batchNum}: ${error.message}`);
        } else {
          auditData.successfulInserts += records.length;
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
  auditData.mappedRowCount = dataRows.length;

  if (auditData.fileRowCount !== auditData.mappedRowCount) {
    auditData.warnings.push(`Row count drift: parsed ${auditData.fileRowCount}, mapped ${auditData.mappedRowCount}`);
  }
  if (auditData.attemptedInserts !== auditData.successfulInserts + auditData.failedInserts) {
    auditData.warnings.push(`Insert count mismatch: attempted ${auditData.attemptedInserts}, success ${auditData.successfulInserts} + failed ${auditData.failedInserts}`);
  }

  // Update upload record
  const { error: updateError } = await supabase.from("data_uploads").update({
    status: auditData.successfulInserts > 0 ? "ready" : "error",
    row_count: auditData.fileRowCount,  // Store total file rows for accurate reporting
    data_type: mapping.dataType,
    column_names: headers,
    column_mapping: mapping.fieldMap,
    project_id: projectId,
    error_message: auditData.failedInserts > 0
      ? `${auditData.successfulInserts} of ${auditData.fileRowCount} rows inserted, ${auditData.failedInserts} failed. ${auditData.failedBatches[0] ?? ""}`
      : (auditData.warnings.length > 0 ? auditData.warnings.join("; ") : null),
  }).eq("id", uploadId);

  if (updateError) {
    console.error("[orchestrator] Failed to update upload status:", updateError.message);
  }

  // ══════════════════════════════════════════════════
  //  STEP 6: POST-PROCESSING
  // ══════════════════════════════════════════════════
  onProgress({ percent: 95, stage: "Finalizing..." });

  // Learning pipeline is triggered once after all uploads complete (UploadPage.tsx uploadAll)

  console.log(`[orchestrator] Upload complete:`, JSON.stringify(auditData));

  if (auditData.successfulInserts > 0) {
    audit({
      action: "data.upload_complete",
      meta: { rows: auditData.successfulInserts, failed: auditData.failedInserts, dataType: mapping.dataType },
      resourceId: uploadId,
      resourceType: "data_upload",
    });
  } else {
    audit({
      action: "data.upload_fail",
      meta: { error: auditData.failedBatches[0] ?? "No rows inserted" },
      resourceId: uploadId,
      resourceType: "data_upload",
    });
  }

  return {
    success: auditData.successfulInserts > 0,
    dataType: mapping.dataType,
    audit: auditData,
    mapping,
  };
}
