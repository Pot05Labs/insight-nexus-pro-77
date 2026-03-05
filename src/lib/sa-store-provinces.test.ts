import { describe, expect, it } from "vitest";
import { canonicalProvince, resolveProvince } from "@/lib/sa-store-provinces";

describe("sa-store-provinces", () => {
  it("canonicalizes canonical names and province abbreviations", () => {
    expect(canonicalProvince("Gauteng")).toBe("Gauteng");
    expect(canonicalProvince("gp")).toBe("Gauteng");
    expect(canonicalProvince("WC")).toBe("Western Cape");
    expect(canonicalProvince("KZN")).toBe("KwaZulu-Natal");
  });

  it("resolves province aliases embedded in store labels", () => {
    expect(resolveProvince({ storeLocation: "Westgate Mall (WC)" })).toBe("Western Cape");
    expect(resolveProvince({ region: "Bluff Kzn" })).toBe("KwaZulu-Natal");
  });

  it("infers province from known store names and noisy location strings", () => {
    expect(resolveProvince({ storeLocation: "Hayfields PMB" })).toBe("KwaZulu-Natal");
    expect(resolveProvince({ storeLocation: "WW Dark Store" })).toBe("Gauteng");
  });

  it("returns null when it cannot confidently resolve a province", () => {
    expect(resolveProvince({ region: "Mystery Outlet", storeLocation: "Unknown" })).toBeNull();
  });
});
