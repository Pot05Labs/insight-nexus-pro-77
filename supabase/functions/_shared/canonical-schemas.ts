/* ------------------------------------------------------------------ */
/*  Canonical Schemas — Deno-compatible version for Edge Functions      */
/*  Single source of truth for column aliases and data type signals     */
/*  Mirrors src/lib/canonical-schemas.ts for server-side use            */
/* ------------------------------------------------------------------ */

export type SchemaField = {
  required: boolean;
  description: string;
  aliases: string[];
};

export const SELL_OUT_SCHEMA: Record<string, SchemaField> = {
  date: {
    required: true,
    description: "Transaction / delivery date",
    aliases: ["date", "date_delivery", "date delivery", "delivery_date", "delivery date", "delivery_day",
      "week", "period", "month", "day", "report_date", "sale_date", "transaction_date", "order_date", "invoice_date"],
  },
  product_name_raw: {
    required: true,
    description: "Product name or description",
    aliases: ["product", "product_name", "product_name_raw", "item", "description",
      "product_description", "item_name", "title", "product_title", "item_description"],
  },
  sku: {
    required: false,
    description: "SKU, barcode, or product code",
    aliases: ["sku", "sku/subs sku", "sku_code", "subs_sku", "ean", "barcode", "upc", "asin",
      "product_code", "item_code", "article", "article_code", "material", "material_code"],
  },
  retailer: {
    required: true,
    description: "Retailer, vendor, or channel",
    aliases: ["retailer", "vendor", "channel", "store", "marketplace", "outlet", "account",
      "customer", "store_name", "account_name", "partner", "supplier"],
  },
  store_location: {
    required: false,
    description: "Store branch or location",
    aliases: ["store_location", "location", "store_loc", "outlet_location", "branch", "site"],
  },
  region: {
    required: false,
    description: "Province, region, or geography",
    aliases: ["region", "area", "territory", "geo", "geography", "market", "province"],
  },
  category: {
    required: false,
    description: "Product category or segment",
    aliases: ["category", "product_category", "cat", "segment", "product_group", "department"],
  },
  brand: {
    required: false,
    description: "Brand name",
    aliases: ["brand", "brand_name", "manufacturer"],
  },
  sub_brand: {
    required: false,
    description: "Sub-brand or variant",
    aliases: ["sub_brand", "subbrand", "sub_brand_name", "variant", "subs product", "subs_product"],
  },
  format_size: {
    required: false,
    description: "Pack size or format",
    aliases: ["format_size", "format", "size", "pack_size", "pack", "packaging"],
  },
  revenue: {
    required: true,
    description: "Sales value (ZAR)",
    aliases: ["revenue", "sales", "total_sales", "net_sales", "gross_sales", "sales_value",
      "ordered_value", "ordered value",
      "amount", "value", "turnover", "net_revenue", "gross_revenue", "total_value"],
  },
  actual_revenue: {
    required: false,
    description: "Actual sales/merchandise value (vs ordered value)",
    aliases: ["merchandise_sales", "merchandise sales", "actual_sales",
      "actual_revenue", "sell_through_value", "sell_through", "net_merchandise"],
  },
  units_sold: {
    required: true,
    description: "Units sold or quantity",
    aliases: ["units", "units_sold", "qty", "quantity", "volume", "units_ordered",
      "ordered_qty", "ordered qty", "qty_sold", "sold_qty", "total_units"],
  },
  units_supplied: {
    required: false,
    description: "Units supplied or delivered",
    aliases: ["units_supplied", "supplied", "supply_qty", "qty_supplied",
      "supplied_qty", "supplied qty", "delivered", "units_delivered"],
  },
  cost: {
    required: false,
    description: "Cost of goods",
    aliases: ["cost", "cogs", "cost_of_goods", "unit_cost", "total_cost", "cost_value", "cost_price"],
  },
  order_id: {
    required: false,
    description: "Order or transaction ID",
    aliases: ["order_id", "order id", "mainorderid", "main_order_id", "transaction_id", "invoice_id", "invoice_no"],
  },
};

export const CAMPAIGN_SCHEMA: Record<string, SchemaField> = {
  flight_start: {
    required: true,
    description: "Campaign start or report date",
    aliases: ["date", "day", "report_date", "start_date", "flight_start", "campaign_date"],
  },
  flight_end: {
    required: false,
    description: "Campaign end date",
    aliases: ["end_date", "flight_end", "campaign_end"],
  },
  platform: {
    required: true,
    description: "Ad platform (Meta, Google, TikTok, etc.)",
    aliases: ["platform", "source", "network", "media", "media_channel", "ad_platform"],
  },
  channel: {
    required: false,
    description: "Media type or channel",
    aliases: ["channel", "media_type", "channel_type"],
  },
  campaign_name: {
    required: true,
    description: "Campaign name or title",
    aliases: ["campaign", "campaign_name", "campaign_title", "name", "campaign_id"],
  },
  spend: {
    required: true,
    description: "Media spend (ZAR)",
    aliases: ["spend", "cost", "total_spend", "media_spend", "ad_spend", "amount_spent", "media_cost", "investment"],
  },
  impressions: {
    required: false,
    description: "Impressions served",
    aliases: ["impressions", "impressions_paid", "imps", "views", "total_impressions"],
  },
  clicks: {
    required: false,
    description: "Clicks or link clicks",
    aliases: ["clicks", "link_clicks", "total_clicks"],
  },
  ctr: {
    required: false,
    description: "Click-through rate",
    aliases: ["ctr", "click_through_rate", "click_rate"],
  },
  conversions: {
    required: false,
    description: "Conversions or purchases",
    aliases: ["conversions", "purchases", "orders", "actions", "results", "total_conversions"],
  },
  revenue: {
    required: false,
    description: "Attributed revenue",
    aliases: ["revenue", "purchase_value", "conversion_value", "roas_value", "value", "sales_value", "attributed_revenue"],
  },
  total_sales_attributed: {
    required: false,
    description: "Total sales attributed to campaign",
    aliases: ["total_sales_attributed", "attributed_sales", "sales_attributed"],
  },
  total_units_attributed: {
    required: false,
    description: "Total units attributed to campaign",
    aliases: ["total_units_attributed", "attributed_units", "units_attributed"],
  },
};

/* ------------------------------------------------------------------ */
/*  Derived helpers                                                    */
/* ------------------------------------------------------------------ */

/** Extract { canonicalField: aliases[] } from a schema */
export function aliasesFromSchema(
  schema: Record<string, SchemaField>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, field] of Object.entries(schema)) {
    out[key] = field.aliases;
  }
  return out;
}

/** Normalise a string for matching: lowercase, strip non-alphanumeric */
export function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Derive normalised alias sets for matching */
export function deriveNormalisedFields(
  schema: Record<string, SchemaField>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, field] of Object.entries(schema)) {
    out[key] = field.aliases.map(normalise);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Data type signals — curated subsets for classification              */
/* ------------------------------------------------------------------ */

export const SELL_OUT_SIGNALS = new Set([
  "unitssold", "unitssupplied", "retailer", "vendor", "sku", "barcode", "ean",
  "productname", "store", "storename", "cogs", "grosssales", "netsales", "turnover",
  "storelocation", "region", "category", "brand", "orderedvalue", "orderedqty",
  "suppliedqty", "datedelivery", "merchandisesales", "subsproduct", "subssku",
  "mainorderid", "province", "department",
]);

export const CAMPAIGN_SIGNALS = new Set([
  "impressions", "clicks", "spend", "adspend", "mediaspend", "totalspend",
  "ctr", "cpm", "cpc", "roas", "campaign", "campaignname", "adgroup", "adset",
  "platform", "conversions", "flightstart", "flightend", "mediacost", "investment",
  "totalsalesattributed", "totalunitsattributed",
]);
