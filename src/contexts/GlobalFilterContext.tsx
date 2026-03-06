import { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from "react";
import type { SellOutRow } from "@/hooks/useSellOutData";
import type { CampaignRow } from "@/hooks/useCampaignData";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DateRange {
  from: string | null; // ISO date string YYYY-MM-DD
  to: string | null;
}

export interface GlobalFilters {
  brand: string | null;
  retailer: string | null;
  province: string | null;
  dateRange: DateRange;
}

interface GlobalFilterContextValue {
  filters: GlobalFilters;
  setBrand: (brand: string | null) => void;
  setRetailer: (retailer: string | null) => void;
  setProvince: (province: string | null) => void;
  setDateRange: (range: DateRange) => void;
  resetFilters: () => void;
  /** Apply current filters to sell-out data */
  filterSellOut: (data: SellOutRow[]) => SellOutRow[];
  /** Apply current filters to campaign data */
  filterCampaigns: (data: CampaignRow[]) => CampaignRow[];
  /** Whether any filter is currently active */
  hasActiveFilters: boolean;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_FILTERS: GlobalFilters = {
  brand: null,
  retailer: null,
  province: null,
  dateRange: { from: null, to: null },
};

const GlobalFilterContext = createContext<GlobalFilterContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────────

export function GlobalFilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<GlobalFilters>(DEFAULT_FILTERS);

  const setBrand = useCallback((brand: string | null) => {
    setFilters((prev) => ({ ...prev, brand }));
  }, []);

  const setRetailer = useCallback((retailer: string | null) => {
    setFilters((prev) => ({ ...prev, retailer }));
  }, []);

  const setProvince = useCallback((province: string | null) => {
    setFilters((prev) => ({ ...prev, province }));
  }, []);

  const setDateRange = useCallback((dateRange: DateRange) => {
    setFilters((prev) => ({ ...prev, dateRange }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const hasActiveFilters = useMemo(
    () =>
      filters.brand !== null ||
      filters.retailer !== null ||
      filters.province !== null ||
      filters.dateRange.from !== null ||
      filters.dateRange.to !== null,
    [filters],
  );

  // ── Filter functions ──

  const filterSellOut = useCallback(
    (data: SellOutRow[]): SellOutRow[] => {
      let result = data;

      if (filters.brand) {
        const b = filters.brand.toLowerCase();
        result = result.filter((r) => {
          const brand = r.brand?.toLowerCase() ?? "";
          // Also check first word of product name as fallback brand inference
          const firstWord = r.product_name_raw?.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
          return brand === b || firstWord === b;
        });
      }

      if (filters.retailer) {
        const ret = filters.retailer.toLowerCase();
        result = result.filter((r) => (r.retailer?.toLowerCase() ?? "") === ret);
      }

      if (filters.province) {
        const prov = filters.province.toLowerCase();
        result = result.filter((r) => {
          const region = r.region?.toLowerCase() ?? "";
          return region === prov || region.includes(prov);
        });
      }

      if (filters.dateRange.from) {
        result = result.filter((r) => r.date && r.date >= filters.dateRange.from!);
      }
      if (filters.dateRange.to) {
        result = result.filter((r) => r.date && r.date <= filters.dateRange.to!);
      }

      return result;
    },
    [filters],
  );

  const filterCampaigns = useCallback(
    (data: CampaignRow[]): CampaignRow[] => {
      let result = data;

      // Campaigns don't have brand/province/retailer in the same way,
      // but we filter by date range based on flight_start
      if (filters.dateRange.from) {
        result = result.filter((r) => r.flight_start && r.flight_start >= filters.dateRange.from!);
      }
      if (filters.dateRange.to) {
        result = result.filter((r) => r.flight_start && r.flight_start <= filters.dateRange.to!);
      }

      return result;
    },
    [filters],
  );

  const value = useMemo<GlobalFilterContextValue>(
    () => ({
      filters,
      setBrand,
      setRetailer,
      setProvince,
      setDateRange,
      resetFilters,
      filterSellOut,
      filterCampaigns,
      hasActiveFilters,
    }),
    [filters, setBrand, setRetailer, setProvince, setDateRange, resetFilters, filterSellOut, filterCampaigns, hasActiveFilters],
  );

  return <GlobalFilterContext.Provider value={value}>{children}</GlobalFilterContext.Provider>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useGlobalFilters() {
  const ctx = useContext(GlobalFilterContext);
  if (!ctx) throw new Error("useGlobalFilters must be used within a GlobalFilterProvider");
  return ctx;
}
