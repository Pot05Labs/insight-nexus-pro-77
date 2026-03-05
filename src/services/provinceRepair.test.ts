import { describe, expect, it } from "vitest";
import { planProvinceRepairs } from "@/services/provinceRepair";

describe("provinceRepair", () => {
  it("repairs invalid regions, preserves valid provinces, and counts conflicts", () => {
    const result = planProvinceRepairs([
      { id: "1", region: "Hayfields PMB", store_location: null },
      { id: "2", region: "Gauteng", store_location: "Bluff Kzn" },
      { id: "3", region: null, store_location: "Unknown Place" },
      { id: "4", region: "WW Dark Store", store_location: "WW Dark Store" },
    ]);

    expect(result.scanned).toBe(4);
    expect(result.updated).toBe(2);
    expect(result.unresolved).toBe(1);
    expect(result.conflicts).toBe(1);
    expect(result.updatesByProvince["KwaZulu-Natal"]).toContain("1");
    expect(result.updatesByProvince.Gauteng).toContain("4");
  });
});
