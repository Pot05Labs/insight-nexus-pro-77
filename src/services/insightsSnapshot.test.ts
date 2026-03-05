import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignRow } from "@/hooks/useCampaignData";
import type { SellOutRow } from "@/hooks/useSellOutData";
import { buildExecutiveSnapshot, buildGeographySummary } from "@/services/insightsSnapshot";

function makeSellOutRow(overrides: Partial<SellOutRow>): SellOutRow {
  return {
    id: overrides.id ?? "row-id",
    product_name_raw: overrides.product_name_raw ?? "Product A",
    brand: overrides.brand ?? "Brand A",
    category: overrides.category ?? "Snacks",
    retailer: overrides.retailer ?? "Woolworths",
    store_location: overrides.store_location ?? "Westgate Mall (WC)",
    region: overrides.region ?? null,
    date: overrides.date ?? "2026-03-01",
    revenue: overrides.revenue ?? 1000,
    units_sold: overrides.units_sold ?? 20,
    cost: overrides.cost ?? 500,
    sku: overrides.sku ?? "SKU-1",
    sub_brand: overrides.sub_brand ?? null,
    format_size: overrides.format_size ?? null,
    units_supplied: overrides.units_supplied ?? 20,
  };
}

function makeCampaignRow(overrides: Partial<CampaignRow>): CampaignRow {
  return {
    flight_start: overrides.flight_start ?? "2026-03-01",
    flight_end: overrides.flight_end ?? "2026-03-05",
    platform: overrides.platform ?? "Meta",
    channel: overrides.channel ?? "Paid Social",
    campaign_name: overrides.campaign_name ?? "Launch Campaign",
    impressions: overrides.impressions ?? 10000,
    clicks: overrides.clicks ?? 500,
    spend: overrides.spend ?? 2000,
    conversions: overrides.conversions ?? 30,
    revenue: overrides.revenue ?? 8000,
  };
}

describe("insightsSnapshot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-06T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds sell-out-only executive snapshots and skips empty sections", () => {
    const snapshot = buildExecutiveSnapshot({
      sellOutData: [
        makeSellOutRow({ id: "1", store_location: "Westgate Mall (WC)", region: "Westgate Mall (WC)" }),
        makeSellOutRow({ id: "2", product_name_raw: "Product B", retailer: "Checkers", revenue: 500 }),
      ],
      campaignData: [],
    });

    expect(snapshot.sections.map((section) => section.key)).toEqual([
      "dashboard",
      "products",
      "retailers",
      "geography",
      "behaviour",
    ]);
    expect(snapshot.text).not.toContain("[CAMPAIGNS]");
  });

  it("builds campaign-only snapshots cleanly", () => {
    const snapshot = buildExecutiveSnapshot({
      sellOutData: [],
      campaignData: [makeCampaignRow({ campaign_name: "Campaign Only" })],
    });

    expect(snapshot.sections.map((section) => section.key)).toEqual(["dashboard", "campaigns"]);
    expect(snapshot.text).toContain("[CAMPAIGNS]");
  });

  it("builds mixed snapshots across all analytics pages", () => {
    const snapshot = buildExecutiveSnapshot({
      sellOutData: [
        makeSellOutRow({ id: "1", retailer: "Woolworths", revenue: 1200 }),
        makeSellOutRow({ id: "2", retailer: "Checkers", product_name_raw: "Product B", revenue: 900, store_location: "Hayfields PMB" }),
      ],
      campaignData: [makeCampaignRow({ campaign_name: "Launch Campaign" })],
    });

    expect(snapshot.sections.map((section) => section.key)).toEqual([
      "dashboard",
      "products",
      "retailers",
      "geography",
      "behaviour",
      "campaigns",
    ]);
    expect(snapshot.text).toContain("[GEOGRAPHY]");
    expect(snapshot.text).toContain("[CAMPAIGNS]");
  });

  it("canonicalizes geography summaries from dirty region values", () => {
    const summary = buildGeographySummary([
      makeSellOutRow({
        id: "1",
        region: "Westgate Mall (WC)",
        store_location: "Westgate Mall (WC)",
        revenue: 2000,
      }),
      makeSellOutRow({
        id: "2",
        region: "WW Dark Store",
        store_location: "WW Dark Store",
        revenue: 1500,
      }),
    ]);

    expect(summary?.summary).toContain("Western Cape");
    expect(summary?.summary).toContain("Gauteng");
    expect(summary?.summary).not.toContain("WW Dark Store (R1.5K). Revenue by province: WW Dark Store");
  });
});
