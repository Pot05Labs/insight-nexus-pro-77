/* ------------------------------------------------------------------ */
/*  Canonical Schemas — defines what SignalStack expects from uploads  */
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
      "product_description", "item_name", "title", "product_title", "item_description",
      "sku_name", "sku name"],
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
      "ordered_qty", "ordered qty", "qty_sold", "sold_qty", "total_units",
      "items_sold", "items sold", "items"],
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
/*  Schema Mapping Report                                              */
/* ------------------------------------------------------------------ */

export type SchemaMapping = {
  canonical: string;
  sourceColumn: string;
  sampleValue: string;
  required: boolean;
};

export type SchemaReport = {
  dataType: "sell_out" | "campaign" | "mixed";
  mapped: SchemaMapping[];
  unmapped: { canonical: string; description: string; required: boolean }[];
  unmappedSource: string[];
  confidence: number;
};

export function buildSchemaReport(
  headers: string[],
  rows: Record<string, unknown>[],
  fieldMap: Record<string, string>,
  schema: Record<string, SchemaField>,
  dataType: "sell_out" | "campaign" | "mixed",
): SchemaReport {
  const mapped: SchemaMapping[] = [];
  const unmapped: { canonical: string; description: string; required: boolean }[] = [];
  const mappedSourceCols = new Set<string>();

  for (const [canonical, field] of Object.entries(schema)) {
    const sourceCol = fieldMap[canonical];
    if (sourceCol) {
      const sampleRow = rows.find((r) => r[sourceCol] !== null && r[sourceCol] !== undefined && r[sourceCol] !== "");
      mapped.push({
        canonical,
        sourceColumn: sourceCol,
        sampleValue: sampleRow ? String(sampleRow[sourceCol]) : "",
        required: field.required,
      });
      mappedSourceCols.add(sourceCol);
    } else {
      unmapped.push({ canonical, description: field.description, required: field.required });
    }
  }

  const unmappedSource = headers.filter((h) => !mappedSourceCols.has(h));

  const totalFields = Object.keys(schema).length;
  const requiredFields = Object.entries(schema).filter(([, f]) => f.required).length;
  const requiredMapped = mapped.filter((m) => m.required).length;
  const confidence = totalFields > 0
    ? Math.round(((requiredMapped / Math.max(requiredFields, 1)) * 70 + (mapped.length / totalFields) * 30))
    : 0;

  return { dataType, mapped, unmapped, unmappedSource, confidence };
}
