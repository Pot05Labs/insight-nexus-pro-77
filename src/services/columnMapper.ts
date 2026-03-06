/**
 * columnMapper.ts — Column name to canonical field mapper
 *
 * Two-pass approach:
 *   Pass 1: Local fuzzy matching (free, instant)
 *   Pass 2: LLM validation via ai-schema-detect (R0.02, 2 seconds)
 *
 * The LLM ONLY sees column names and 3 sample rows.
 * It NEVER sees the full dataset.
 * It NEVER transforms values — only maps column names.
 */

import { supabase } from "@/integrations/supabase/client";
import { SELL_OUT_SCHEMA, CAMPAIGN_SCHEMA, type SchemaField } from "@/lib/canonical-schemas";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type DataType = "sell_out" | "campaign" | "mixed" | "unknown";

export interface ColumnMapping {
  dataType: DataType;
  confidence: number;         // 0-1, how confident we are in the mapping
  fieldMap: Record<string, string>;  // canonical_field → source_column_name
  unmappedColumns: string[];  // source columns that didn't map to anything
  source: "local" | "llm";   // which pass produced this mapping
}

/* ------------------------------------------------------------------ */
/*  Normalisation (must be defined before field derivation)             */
/* ------------------------------------------------------------------ */

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/* ------------------------------------------------------------------ */
/*  Canonical field definitions — derived from canonical-schemas.ts    */
/* ------------------------------------------------------------------ */

// Single source of truth: aliases come from SELL_OUT_SCHEMA and CAMPAIGN_SCHEMA
// in src/lib/canonical-schemas.ts. This eliminates drift between the two files.

function deriveFields(schema: Record<string, SchemaField>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, field] of Object.entries(schema)) {
    out[key] = field.aliases.map(normalise);
  }
  return out;
}

const SELL_OUT_FIELDS: Record<string, string[]> = deriveFields(SELL_OUT_SCHEMA);
const CAMPAIGN_FIELDS: Record<string, string[]> = deriveFields(CAMPAIGN_SCHEMA);

// Signals: if a file contains 3+ of these normalised terms in its headers, it's this type.
// These are a curated subset used for data-type classification, not full alias lists.
// Keep in sync with canonical-schemas.ts when adding new aliases.
const SELL_OUT_SIGNALS = new Set([
  "unitssold", "unitssupplied", "retailer", "vendor", "sku", "barcode", "ean",
  "productname", "skuname", "store", "storename", "cogs", "grosssales", "netsales", "turnover",
  "storelocation", "region", "category", "brand", "orderedvalue", "orderedqty",
  "suppliedqty", "datedelivery", "merchandisesales", "subsproduct", "subssku",
  "mainorderid", "province", "department", "itemssold",
]);

const CAMPAIGN_SIGNALS = new Set([
  "impressions", "clicks", "spend", "adspend", "mediaspend", "totalspend",
  "ctr", "cpm", "cpc", "roas", "campaign", "campaignname", "adgroup", "adset",
  "platform", "conversions", "flightstart", "flightend", "mediacost", "investment",
  "totalsalesattributed", "totalunitsattributed",
]);

/* ------------------------------------------------------------------ */
/*  Pass 1: Local fuzzy matching                                       */
/* ------------------------------------------------------------------ */

function localMatch(headers: string[]): ColumnMapping {
  const normHeaders = headers.map(normalise);

  // 1. Classify data type
  let soScore = 0;
  let cpScore = 0;
  for (const nh of normHeaders) {
    if (SELL_OUT_SIGNALS.has(nh)) soScore++;
    if (CAMPAIGN_SIGNALS.has(nh)) cpScore++;
    // Also check substring inclusion for compound headers
    // Only check if header CONTAINS signal (not reverse — avoids false positives)
    for (const sig of SELL_OUT_SIGNALS) {
      if (nh.includes(sig)) { soScore += 0.5; break; }
    }
    for (const sig of CAMPAIGN_SIGNALS) {
      if (nh.includes(sig)) { cpScore += 0.5; break; }
    }
  }

  let dataType: DataType;
  if (soScore >= 3 && cpScore >= 3) dataType = "mixed";
  else if (cpScore > soScore && cpScore >= 2) dataType = "campaign";
  else if (soScore >= 2) dataType = "sell_out";
  else dataType = "unknown";

  // 2. Build field map
  const fieldMap: Record<string, string> = {};
  const usedHeaders = new Set<string>();

  // For mixed type, merge schemas carefully: sell-out fields first,
  // then campaign-only fields (avoid overwriting shared keys like "revenue")
  const schemaToUse = dataType === "campaign" ? CAMPAIGN_FIELDS
    : dataType === "mixed" ? (() => {
        const merged: Record<string, string[]> = { ...SELL_OUT_FIELDS };
        for (const [key, aliases] of Object.entries(CAMPAIGN_FIELDS)) {
          if (merged[key]) {
            // Merge aliases without duplicates — sell-out aliases take priority
            const combined = [...merged[key]];
            for (const a of aliases) {
              if (!combined.includes(a)) combined.push(a);
            }
            merged[key] = combined;
          } else {
            merged[key] = aliases;
          }
        }
        return merged;
      })()
    : SELL_OUT_FIELDS;

  for (const [canonical, aliases] of Object.entries(schemaToUse)) {
    // Exact normalised match first
    for (let i = 0; i < normHeaders.length; i++) {
      if (aliases.includes(normHeaders[i]) && !usedHeaders.has(headers[i])) {
        fieldMap[canonical] = headers[i];
        usedHeaders.add(headers[i]);
        break;
      }
    }
    // Substring match if no exact — only check if header CONTAINS alias
    // (NOT the reverse, which caused false matches like "qty" matching "orderedqty")
    if (!fieldMap[canonical]) {
      for (let i = 0; i < normHeaders.length; i++) {
        if (usedHeaders.has(headers[i])) continue;
        const nh = normHeaders[i];
        for (const alias of aliases) {
          if (nh.includes(alias)) {
            fieldMap[canonical] = headers[i];
            usedHeaders.add(headers[i]);
            break;
          }
        }
        if (fieldMap[canonical]) break;
      }
    }
  }

  const unmappedColumns = headers.filter(h => !usedHeaders.has(h));

  // 3. Calculate confidence
  const totalCanonical = Object.keys(schemaToUse).length;
  const mappedCount = Object.keys(fieldMap).length;
  const confidence = Math.min(1, mappedCount / Math.min(totalCanonical, headers.length));

  return {
    dataType: dataType === "unknown" ? "unknown" : dataType,
    confidence: Math.round(confidence * 100) / 100,
    fieldMap,
    unmappedColumns,
    source: "local",
  };
}

/* ------------------------------------------------------------------ */
/*  Pass 2: LLM validation via OpenRouter                              */
/* ------------------------------------------------------------------ */

async function llmValidate(
  headers: string[],
  sampleRows: Record<string, string>[],
  localResult: ColumnMapping,
): Promise<ColumnMapping | null> {
  try {
    const { data, error } = await supabase.functions.invoke("ai-schema-detect", {
      body: {
        headers,
        sampleRows: sampleRows.slice(0, 3),  // Only 3 rows — minimal token usage
        localMapping: localResult.fieldMap,
        localDataType: localResult.dataType,
        localConfidence: localResult.confidence,
      },
    });

    if (error || !data) {
      console.warn("[columnMapper] LLM validation failed:", error?.message);
      return null;
    }

    const result = typeof data === "string" ? JSON.parse(data) : data;

    if (!result.column_mapping || typeof result.column_mapping !== "object") {
      console.warn("[columnMapper] LLM returned invalid mapping");
      return null;
    }

    return {
      dataType: result.data_type ?? localResult.dataType,
      confidence: result.confidence ?? 0.9,
      fieldMap: result.column_mapping,
      unmappedColumns: result.unmapped_columns ?? [],
      source: "llm",
    };
  } catch (err) {
    console.warn("[columnMapper] LLM validation error:", err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export async function mapColumns(
  headers: string[],
  sampleRows: Record<string, string>[],
): Promise<ColumnMapping> {

  // Pass 1: Local
  const local = localMatch(headers);

  console.log(`[columnMapper] Local match: type=${local.dataType}, confidence=${local.confidence}, mapped=${Object.keys(local.fieldMap).length}/${headers.length}`);

  // Decide if LLM pass is needed
  const needsLLM =
    local.dataType === "unknown" ||                    // couldn't classify at all
    local.confidence < 0.4 ||                          // mapped fewer than 40% of relevant fields
    local.unmappedColumns.length > headers.length * 0.5; // more than half unmapped

  if (!needsLLM) {
    return local;
  }

  // Pass 2: LLM
  console.log("[columnMapper] Confidence too low, calling LLM...");
  const llmResult = await llmValidate(headers, sampleRows, local);

  if (llmResult && llmResult.confidence > local.confidence) {
    console.log(`[columnMapper] LLM improved mapping: type=${llmResult.dataType}, confidence=${llmResult.confidence}`);
    return llmResult;
  }

  // LLM didn't help or failed — return local result
  return local;
}
