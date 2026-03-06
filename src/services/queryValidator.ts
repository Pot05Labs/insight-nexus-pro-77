/* ------------------------------------------------------------------ */
/*  Query Validator — client-side pre-validation for AI query output  */
/*  Catches malformed / dangerous queries before they reach Supabase  */
/* ------------------------------------------------------------------ */

import { validateQuery, type ValidatedQuery, type QueryValidationResult } from "@/lib/query-schema";

/**
 * Attempt to extract a JSON query object from an AI response string.
 * The AI may wrap the JSON in markdown code fences or plain text.
 */
export function extractQueryFromResponse(text: string): unknown | null {
  // Try direct JSON parse first
  try {
    const parsed = JSON.parse(text.trim());
    if (parsed && typeof parsed === "object" && "table" in parsed) return parsed;
  } catch {
    // Not raw JSON — try to find embedded JSON
  }

  // Look for JSON inside markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim());
      if (parsed && typeof parsed === "object" && "table" in parsed) return parsed;
    } catch {
      // Malformed JSON in fence
    }
  }

  // Look for first { ... } block that contains "table"
  const braceMatch = text.match(/\{[\s\S]*?"table"[\s\S]*?\}/);
  if (braceMatch) {
    try {
      const parsed = JSON.parse(braceMatch[0]);
      if (parsed && typeof parsed === "object" && "table" in parsed) return parsed;
    } catch {
      // Malformed JSON
    }
  }

  return null;
}

/**
 * Full validation pipeline: extract → validate → return typed result.
 */
export function validateAiQueryResponse(responseText: string): QueryValidationResult & { raw?: unknown } {
  const raw = extractQueryFromResponse(responseText);
  if (!raw) {
    return { ok: false, errors: ["Could not extract a valid JSON query from the AI response."], raw: null };
  }

  const result = validateQuery(raw);
  return { ...result, raw };
}

/**
 * Check if a text response from the AI looks like it contains a query (vs narrative text).
 */
export function looksLikeQuery(text: string): boolean {
  const trimmed = text.trim();
  // Quick heuristics: contains "table" key in JSON-like structure
  return (
    (trimmed.startsWith("{") && trimmed.includes('"table"')) ||
    (trimmed.includes("```") && trimmed.includes('"table"'))
  );
}

export type { ValidatedQuery };
