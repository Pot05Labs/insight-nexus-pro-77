/* ------------------------------------------------------------------ */
/*  Query Schema — Zod validation for AI-generated database queries   */
/*  Server-authoritative allowlists prevent injection & data leaks    */
/* ------------------------------------------------------------------ */

import { z } from "zod";

/* ─── Allowed Tables ─── */

export const ALLOWED_TABLES = [
  "sell_out_data",
  "campaign_data_v2",
  "computed_metrics",
] as const;

export type AllowedTable = (typeof ALLOWED_TABLES)[number];

/* ─── Allowed Columns Per Table ─── */

export const TABLE_COLUMNS: Record<AllowedTable, readonly string[]> = {
  sell_out_data: [
    "retailer", "brand", "sub_brand", "product_name_raw", "sku",
    "category", "format_size", "region", "store_location",
    "date", "revenue", "actual_revenue", "units_sold", "units_supplied", "cost",
    "order_id",
  ],
  campaign_data_v2: [
    "platform", "channel", "campaign_name",
    "flight_start", "flight_end",
    "spend", "impressions", "clicks", "ctr", "cpm",
    "conversions", "revenue",
    "total_sales_attributed", "total_units_attributed",
  ],
  computed_metrics: [
    "metric_name", "metric_value", "dimensions", "computed_at",
  ],
} as const;

/* ─── Forbidden Columns (injected server-side, never in AI output) ─── */

export const FORBIDDEN_COLUMNS = [
  "user_id", "project_id", "deleted_at", "id", "upload_id", "created_at", "updated_at",
] as const;

/* ─── Allowed Filter Operators ─── */

export const ALLOWED_OPERATORS = [
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike",
] as const;

/* ─── Max query limit ─── */

export const MAX_QUERY_LIMIT = 500;

/* ─── Zod Schemas ─── */

const filterSchema = z.object({
  column: z.string().min(1),
  operator: z.enum(ALLOWED_OPERATORS),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

const orderSchema = z.object({
  column: z.string().min(1),
  ascending: z.boolean().default(false),
});

export const querySchema = z.object({
  table: z.enum(ALLOWED_TABLES),
  select: z.string().min(1).max(500),
  filters: z.array(filterSchema).max(20).default([]),
  order: orderSchema.optional(),
  limit: z.number().int().min(1).max(MAX_QUERY_LIMIT).default(10),
  explanation: z.string().max(500).optional(),
});

export type ValidatedQuery = z.infer<typeof querySchema>;
export type QueryFilter = z.infer<typeof filterSchema>;

/* ─── Validation Result ─── */

export type QueryValidationResult =
  | { ok: true; query: ValidatedQuery }
  | { ok: false; errors: string[] };

/**
 * Validate an AI-generated query against the allowlist schema.
 * Returns either a validated query or an array of human-readable error strings.
 */
export function validateQuery(raw: unknown): QueryValidationResult {
  // Step 1: Parse with Zod
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`
      ),
    };
  }

  const query = parsed.data;
  const errors: string[] = [];

  // Step 2: Validate selected columns against table allowlist
  const allowedCols = TABLE_COLUMNS[query.table];
  const selectCols = parseSelectColumns(query.select);

  for (const col of selectCols) {
    if (FORBIDDEN_COLUMNS.includes(col as (typeof FORBIDDEN_COLUMNS)[number])) {
      errors.push(`Forbidden column in select: "${col}" — tenant-scoping columns are injected server-side.`);
    } else if (col !== "*" && !allowedCols.includes(col) && !isAggregateExpression(col)) {
      errors.push(`Unknown column in select: "${col}" is not in ${query.table}.`);
    }
  }

  // Step 3: Validate filter columns
  for (const filter of query.filters) {
    if (FORBIDDEN_COLUMNS.includes(filter.column as (typeof FORBIDDEN_COLUMNS)[number])) {
      errors.push(`Forbidden filter column: "${filter.column}" — tenant-scoping is handled automatically.`);
    } else if (!allowedCols.includes(filter.column)) {
      errors.push(`Unknown filter column: "${filter.column}" is not in ${query.table}.`);
    }
  }

  // Step 4: Validate order column
  if (query.order) {
    if (FORBIDDEN_COLUMNS.includes(query.order.column as (typeof FORBIDDEN_COLUMNS)[number])) {
      errors.push(`Forbidden order column: "${query.order.column}".`);
    } else if (!allowedCols.includes(query.order.column)) {
      errors.push(`Unknown order column: "${query.order.column}" is not in ${query.table}.`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, query };
}

/* ─── Helpers ─── */

/** Parse a select string like "retailer, sum(revenue), count(*)" into column names */
function parseSelectColumns(select: string): string[] {
  return select
    .split(",")
    .map((s) => s.trim())
    .map((s) => {
      // Strip aggregate wrappers: sum(revenue) → revenue, count(*) → *
      const aggMatch = s.match(/^\w+\(([^)]+)\)$/);
      return aggMatch ? aggMatch[1].trim() : s;
    })
    .filter(Boolean);
}

/** Check if a column string is an aggregate expression (e.g. sum(revenue)) */
function isAggregateExpression(col: string): boolean {
  return /^\w+\(.+\)$/.test(col);
}
