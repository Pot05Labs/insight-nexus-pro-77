import { useMemo } from "react";
import { Filter, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGlobalFilters } from "@/contexts/GlobalFilterContext";
import { useSellOutData } from "@/hooks/useSellOutData";

/**
 * Global Filter Bar — appears at the top of the dashboard content area.
 * Provides brand, retailer, province, and date range filters that persist
 * across all pages for the Coca Cola enterprise experience.
 */
const GlobalFilterBar = () => {
  const { filters, setBrand, setRetailer, setProvince, setDateRange, resetFilters, hasActiveFilters } = useGlobalFilters();
  const { data } = useSellOutData();

  // Extract unique filter options from data
  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const r of data) {
      if (r.brand) {
        set.add(r.brand);
      } else if (r.product_name_raw) {
        const firstWord = r.product_name_raw.trim().split(/\s+/)[0];
        if (firstWord && firstWord.length > 1) set.add(firstWord);
      }
    }
    return Array.from(set).sort();
  }, [data]);

  const retailers = useMemo(() => {
    const set = new Set<string>();
    for (const r of data) {
      if (r.retailer) set.add(r.retailer);
    }
    return Array.from(set).sort();
  }, [data]);

  const provinces = useMemo(() => {
    const set = new Set<string>();
    for (const r of data) {
      if (r.region) set.add(r.region);
    }
    return Array.from(set).sort();
  }, [data]);

  // Date range — extract min/max available months
  const dateMonths = useMemo(() => {
    const months = new Set<string>();
    for (const r of data) {
      if (r.date) {
        const m = r.date.slice(0, 7); // YYYY-MM
        if (m) months.add(m);
      }
    }
    return Array.from(months).sort();
  }, [data]);

  // Don't show filter bar if there's no data
  if (data.length === 0) return null;

  const activeCount = [filters.brand, filters.retailer, filters.province, filters.dateRange.from].filter(Boolean).length;

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 overflow-x-auto">
      <div className="flex items-center gap-1.5 shrink-0">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filters</span>
        {activeCount > 0 && (
          <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] font-bold">
            {activeCount}
          </Badge>
        )}
      </div>

      {/* Brand Filter */}
      {brands.length > 0 && (
        <Select value={filters.brand ?? "__all__"} onValueChange={(v) => setBrand(v === "__all__" ? null : v)}>
          <SelectTrigger className="h-7 w-[140px] text-xs">
            <SelectValue placeholder="All Brands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Brands</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Retailer Filter */}
      {retailers.length > 0 && (
        <Select value={filters.retailer ?? "__all__"} onValueChange={(v) => setRetailer(v === "__all__" ? null : v)}>
          <SelectTrigger className="h-7 w-[140px] text-xs">
            <SelectValue placeholder="All Retailers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Retailers</SelectItem>
            {retailers.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Province Filter */}
      {provinces.length > 0 && (
        <Select value={filters.province ?? "__all__"} onValueChange={(v) => setProvince(v === "__all__" ? null : v)}>
          <SelectTrigger className="h-7 w-[140px] text-xs">
            <SelectValue placeholder="All Provinces" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Provinces</SelectItem>
            {provinces.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Date Range — From Month */}
      {dateMonths.length > 1 && (
        <Select
          value={filters.dateRange.from ? filters.dateRange.from.slice(0, 7) : "__all__"}
          onValueChange={(v) => {
            if (v === "__all__") {
              setDateRange({ from: null, to: filters.dateRange.to });
            } else {
              setDateRange({ from: `${v}-01`, to: filters.dateRange.to });
            }
          }}
        >
          <SelectTrigger className="h-7 w-[120px] text-xs">
            <SelectValue placeholder="From" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">From: All</SelectItem>
            {dateMonths.map((m) => (
              <SelectItem key={m} value={m}>
                {new Date(m + "-01").toLocaleDateString("en-ZA", { month: "short", year: "numeric" })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Date Range — To Month */}
      {dateMonths.length > 1 && (
        <Select
          value={filters.dateRange.to ? filters.dateRange.to.slice(0, 7) : "__all__"}
          onValueChange={(v) => {
            if (v === "__all__") {
              setDateRange({ from: filters.dateRange.from, to: null });
            } else {
              // Set to last day of month
              const [year, month] = v.split("-").map(Number);
              const lastDay = new Date(year, month, 0).getDate();
              setDateRange({ from: filters.dateRange.from, to: `${v}-${String(lastDay).padStart(2, "0")}` });
            }
          }}
        >
          <SelectTrigger className="h-7 w-[120px] text-xs">
            <SelectValue placeholder="To" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">To: All</SelectItem>
            {dateMonths.map((m) => (
              <SelectItem key={m} value={m}>
                {new Date(m + "-01").toLocaleDateString("en-ZA", { month: "short", year: "numeric" })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Clear All */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground shrink-0" onClick={resetFilters}>
          <X className="h-3 w-3" />
          Clear
        </Button>
      )}
    </div>
  );
};

export default GlobalFilterBar;
