/* ------------------------------------------------------------------ */
/*  Column Mapper — Deno-compatible version for Edge Functions          */
/*  Detects data type and maps source columns to canonical fields      */
/*  Mirrors src/services/columnMapper.ts localMatch logic              */
/* ------------------------------------------------------------------ */

import {
  SELL_OUT_SCHEMA,
  CAMPAIGN_SCHEMA,
  aliasesFromSchema,
  normalise,
  deriveNormalisedFields,
  SELL_OUT_SIGNALS,
  CAMPAIGN_SIGNALS,
} from "./canonical-schemas.ts";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type DataType = "sell_out" | "campaign" | "mixed" | "unknown";

export type DetectedTypes = { sell_out: boolean; campaign: boolean };

export interface FieldMapResult {
  dataType: DataType;
  soFieldMap: Record<string, string>;
  cpFieldMap: Record<string, string>;
  combinedFieldMap: Record<string, string>;
  unmappedColumns: string[];
  confidence: number;
}

/* ------------------------------------------------------------------ */
/*  Raw alias maps (un-normalised, for buildFieldMap)                   */
/* ------------------------------------------------------------------ */

const SELL_OUT_ALIASES = aliasesFromSchema(SELL_OUT_SCHEMA);
const CAMPAIGN_ALIASES = aliasesFromSchema(CAMPAIGN_SCHEMA);

/* ------------------------------------------------------------------ */
/*  Normalised fields (for localMatch / classification)                 */
/* ------------------------------------------------------------------ */

const SELL_OUT_FIELDS = deriveNormalisedFields(SELL_OUT_SCHEMA);
const CAMPAIGN_FIELDS = deriveNormalisedFields(CAMPAIGN_SCHEMA);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function norm(s: string): string {
  return s.trim().replace(/^["']|["']$/g, "").toLowerCase();
}

/* ------------------------------------------------------------------ */
/*  Data type detection                                                */
/* ------------------------------------------------------------------ */

/**
 * Detect whether headers suggest sell_out, campaign, or mixed data.
 * Uses signal sets: if 3+ sell_out signals → sell_out, etc.
 */
export function detectDataTypes(headers: string[]): DetectedTypes {
  const normHeaders = headers.map(normalise);
  let soScore = 0;
  let cpScore = 0;

  for (const nh of normHeaders) {
    if (SELL_OUT_SIGNALS.has(nh)) soScore++;
    if (CAMPAIGN_SIGNALS.has(nh)) cpScore++;
    // Substring inclusion for compound headers
    for (const sig of SELL_OUT_SIGNALS) {
      if (nh.includes(sig)) { soScore += 0.5; break; }
    }
    for (const sig of CAMPAIGN_SIGNALS) {
      if (nh.includes(sig)) { cpScore += 0.5; break; }
    }
  }

  if (soScore >= 3 && cpScore >= 3) return { sell_out: true, campaign: true };
  if (cpScore > soScore && cpScore >= 2) return { sell_out: false, campaign: true };
  if (soScore >= 2) return { sell_out: true, campaign: false };
  return { sell_out: true, campaign: false }; // default to sell_out
}

/* ------------------------------------------------------------------ */
/*  Field mapping (raw alias matching)                                  */
/* ------------------------------------------------------------------ */

/**
 * Build a canonical→sourceColumn map using alias matching.
 * Two-pass: exact normalised match, then substring match.
 */
export function buildFieldMap(
  headers: string[],
  aliases: Record<string, string[]>,
): Record<string, string> {
  const map: Record<string, string> = {};
  const normHeaders = headers.map(norm);

  for (const [canonical, alts] of Object.entries(aliases)) {
    // Pass 1: Exact match
    for (const alt of alts) {
      const idx = normHeaders.indexOf(alt);
      if (idx !== -1 && !Object.values(map).includes(headers[idx])) {
        map[canonical] = headers[idx];
        break;
      }
    }
    // Pass 2: Substring match
    if (!map[canonical]) {
      for (const alt of alts) {
        const idx = normHeaders.findIndex(
          (h) => (h.includes(alt) || alt.includes(h)) && !Object.values(map).includes(headers[normHeaders.indexOf(h) === -1 ? -1 : normHeaders.indexOf(h)])
        );
        if (idx !== -1) {
          map[canonical] = headers[idx];
          break;
        }
      }
    }
  }

  return map;
}

/* ------------------------------------------------------------------ */
/*  Combined mapper (used by process-upload)                            */
/* ------------------------------------------------------------------ */

/**
 * Detect data type and build field maps for both sell-out and campaign.
 * Returns everything process-upload needs in one call.
 */
export function mapColumns(headers: string[]): FieldMapResult {
  const types = detectDataTypes(headers);
  const isMixed = types.sell_out && types.campaign;
  const isCampaignOnly = types.campaign && !types.sell_out;

  const soFieldMap = types.sell_out ? buildFieldMap(headers, SELL_OUT_ALIASES) : {};
  const cpFieldMap = types.campaign ? buildFieldMap(headers, CAMPAIGN_ALIASES) : {};
  const combinedFieldMap = isCampaignOnly ? cpFieldMap : (isMixed ? { ...soFieldMap, ...cpFieldMap } : soFieldMap);

  const dataType: DataType = isMixed ? "mixed" : (isCampaignOnly ? "campaign" : "sell_out");

  // Confidence: how many canonical fields were mapped
  const normHeaders = headers.map(normalise);
  const usedHeaders = new Set(Object.values(combinedFieldMap));
  const schemaFields = dataType === "campaign" ? CAMPAIGN_FIELDS
    : dataType === "mixed" ? { ...SELL_OUT_FIELDS, ...CAMPAIGN_FIELDS }
    : SELL_OUT_FIELDS;
  const totalCanonical = Object.keys(schemaFields).length;
  const mappedCount = Object.keys(combinedFieldMap).length;
  const confidence = totalCanonical > 0
    ? Math.round((mappedCount / Math.min(totalCanonical, headers.length)) * 100) / 100
    : 0;

  const unmappedColumns = headers.filter((h) => !usedHeaders.has(h));

  return {
    dataType,
    soFieldMap,
    cpFieldMap,
    combinedFieldMap,
    unmappedColumns,
    confidence: Math.min(1, confidence),
  };
}
