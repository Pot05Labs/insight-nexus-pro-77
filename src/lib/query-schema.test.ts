import { describe, it, expect } from "vitest";
import { validateQuery } from "./query-schema";

describe("validateQuery", () => {
  it("accepts a valid sell_out_data query", () => {
    const result = validateQuery({
      table: "sell_out_data",
      select: "retailer, sum(revenue)",
      filters: [{ column: "retailer", operator: "eq", value: "Pick n Pay" }],
      order: { column: "revenue", ascending: false },
      limit: 10,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.query.table).toBe("sell_out_data");
    }
  });

  it("accepts a valid campaign_data_v2 query", () => {
    const result = validateQuery({
      table: "campaign_data_v2",
      select: "platform, spend, impressions, clicks",
      filters: [{ column: "spend", operator: "gt", value: 1000 }],
      limit: 50,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects unknown table", () => {
    const result = validateQuery({
      table: "users",
      select: "*",
      filters: [],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects forbidden column user_id in select", () => {
    const result = validateQuery({
      table: "sell_out_data",
      select: "user_id, retailer, revenue",
      filters: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("user_id"))).toBe(true);
    }
  });

  it("rejects forbidden column project_id in filters", () => {
    const result = validateQuery({
      table: "sell_out_data",
      select: "retailer, revenue",
      filters: [{ column: "project_id", operator: "eq", value: "abc" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("project_id"))).toBe(true);
    }
  });

  it("rejects forbidden column deleted_at in order", () => {
    const result = validateQuery({
      table: "sell_out_data",
      select: "retailer, revenue",
      order: { column: "deleted_at", ascending: false },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("deleted_at"))).toBe(true);
    }
  });

  it("rejects invalid operator", () => {
    const result = validateQuery({
      table: "sell_out_data",
      select: "retailer",
      filters: [{ column: "retailer", operator: "drop_table", value: "" }],
    });
    expect(result.ok).toBe(false);
  });

  it("caps limit at MAX_QUERY_LIMIT", () => {
    const result = validateQuery({
      table: "sell_out_data",
      select: "retailer, revenue",
      limit: 9999,
    });
    expect(result.ok).toBe(false);
  });

  it("defaults limit to 10 when omitted", () => {
    const result = validateQuery({
      table: "sell_out_data",
      select: "retailer, revenue",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.query.limit).toBe(10);
    }
  });

  it("allows aggregate expressions in select", () => {
    const result = validateQuery({
      table: "sell_out_data",
      select: "retailer, sum(revenue), count(*)",
      filters: [],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects column not in table allowlist", () => {
    const result = validateQuery({
      table: "campaign_data_v2",
      select: "store_location, spend",
      filters: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("store_location"))).toBe(true);
    }
  });
});
