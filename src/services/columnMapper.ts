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
/*  Canonical field definitions with aliases                           */
/* ------------------------------------------------------------------ */

// Each canonical field has a list of normalised aliases it might appear as.
// Normalisation: lowercase, strip all non-alphanumeric characters.

const SELL_OUT_FIELDS: Record<string, string[]> = {
  date:             ["date", "datedelivery", "deliverydate", "saledate", "transactiondate", "orderdate", "invoicedate", "reportdate", "period", "week", "month", "day"],
  product_name_raw: ["product", "productname", "productnameraw", "item", "description", "productdescription", "itemname", "producttitle", "itemdescription"],
  sku:              ["sku", "skusubssku", "skucode", "subssku", "ean", "barcode", "upc", "asin", "productcode", "itemcode", "article", "articlecode", "material", "materialcode"],
  retailer:         ["retailer", "vendor", "store", "marketplace", "outlet", "account", "customer", "storename", "accountname", "partner"],
  store_location:   ["storelocation", "location", "storeloc", "outletlocation", "branch", "site"],
  region:           ["region", "area", "territory", "geo", "geography", "market", "province"],
  category:         ["category", "productcategory", "cat", "segment", "productgroup", "department"],
  brand:            ["brand", "brandname", "manufacturer"],
  sub_brand:        ["subbrand", "subsproduct", "subproduct", "variant", "subbrandname"],
  format_size:      ["formatsize", "format", "size", "packsize", "pack", "packaging"],
  revenue:          ["revenue", "sales", "totalsales", "netsales", "grosssales", "salesvalue", "orderedvalue", "amount", "value", "turnover", "netrevenue", "grossrevenue", "totalvalue"],
  actual_revenue:   ["merchandisesales", "actualsales", "actualrevenue", "sellthroughvalue", "sellthrough", "netmerchandise"],
  units_sold:       ["unitssold", "units", "qty", "quantity", "volume", "orderedqty", "qtysold", "soldqty", "totalunits"],
  units_supplied:   ["unitssupplied", "supplied", "supplyqty", "qtysupplied", "suppliedqty", "delivered", "unitsdelivered"],
  cost:             ["cost", "cogs", "costofgoods", "unitcost", "totalcost", "costvalue", "costprice"],
  order_id:         ["mainorderid", "orderid", "transactionid", "invoiceid", "ordernumber"],
};

const CAMPAIGN_FIELDS: Record<string, string[]> = {
  flight_start:             ["date", "startdate", "flightstart", "campaigndate", "reportdate", "day"],
  flight_end:               ["enddate", "flightend", "campaignend"],
  platform:                 ["platform", "source", "network", "media", "mediachannel", "adplatform"],
  channel:                  ["channel", "mediatype", "channeltype"],
  campaign_name:            ["campaign", "campaignname", "campaigntitle", "name", "campaignid", "adgroup", "adset"],
  spend:                    ["spend", "cost", "totalspend", "mediaspend", "adspend", "amountspent", "mediacost", "investment", "budget"],
  impressions:              ["impressions", "impressionspaid", "imps", "views", "totalimpressions"],
  clicks:                   ["clicks", "linkclicks", "totalclicks"],
  ctr:                      ["ctr", "clickthroughrate", "clickrate"],
  cpm:                      ["cpm", "costpermille"],
  conversions:              ["conversions", "purchases", "orders", "actions", "results", "totalconversions"],
  revenue:                  ["revenue", "purchasevalue", "conversionvalue", "roasvalue", "salesvalue", "attributedrevenue"],
  roas:                     ["roas", "returnonadspend"],
  total_sales_attributed:   ["totalsalesattributed", "attributedsales", "salesattributed"],
  total_units_attributed:   ["totalunitsattributed", "attributedunits", "unitsattributed"],
};

// Signals: if a file contains 3+ of these normalised terms in its headers, it's this type
const SELL_OUT_SIGNALS = new Set([
  "unitssold", "unitssupplied", "retailer", "vendor", "sku", "barcode", "ean",
  "productname", "store", "storename", "cogs", "grosssales", "netsales", "turnover",
  "storelocation", "region", "category", "brand", "orderedvalue", "orderedqty",
  "suppliedqty", "datedelivery", "merchandisesales", "subsproduct", "subssku",
  "mainorderid", "province", "department",
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

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function localMatch(headers: string[]): ColumnMapping {
  const normHeaders = headers.map(normalise);

  // 1. Classify data type
  let soScore = 0;
  let cpScore = 0;
  for (const nh of normHeaders) {
    if (SELL_OUT_SIGNALS.has(nh)) soScore++;
    if (CAMPAIGN_SIGNALS.has(nh)) cpScore++;
    // Also check substring inclusion for compound headers
    for (const sig of SELL_OUT_SIGNALS) {
      if (nh.includes(sig) || sig.includes(nh)) { soScore += 0.5; break; }
    }
    for (const sig of CAMPAIGN_SIGNALS) {
      if (nh.includes(sig) || sig.includes(nh)) { cpScore += 0.5; break; }
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

  const schemaToUse = dataType === "campaign" ? CAMPAIGN_FIELDS
    : dataType === "mixed" ? { ...SELL_OUT_FIELDS, ...CAMPAIGN_FIELDS }
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
    // Substring match if no exact
    if (!fieldMap[canonical]) {
      for (let i = 0; i < normHeaders.length; i++) {
        if (usedHeaders.has(headers[i])) continue;
        const nh = normHeaders[i];
        for (const alias of aliases) {
          if (nh.includes(alias) || alias.includes(nh)) {
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
