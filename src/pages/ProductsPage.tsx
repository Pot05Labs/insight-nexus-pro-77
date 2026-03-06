import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, Lightbulb, DollarSign, ShoppingCart, Tag, Package, ChevronLeft, ChevronRight } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import SignalStackInsights from "@/components/SignalStackInsights";
import KpiCard from "@/components/KpiCard";
import { useSellOutData, fmtZAR } from "@/hooks/useSellOutData";
import { useCampaignData } from "@/hooks/useCampaignData";
import { usePeriodComparison, type PeriodType } from "@/hooks/usePeriodComparison";
import { useGlobalFilters } from "@/contexts/GlobalFilterContext";
import { useSellOutKPIs } from "@/hooks/useSellOutKPIs";
import { useSellOutAggregation } from "@/hooks/useAggregation";
import { useTopProducts } from "@/hooks/useTopProducts";
import { chartCursorStyle, chartGridProps, CHART_ANIMATION_MS, CHART_HEIGHT, axisClassName, renderPieLabel, DONUT_COLORS, CHART_PALETTE, topNWithOther } from "@/lib/chart-utils";
import PremiumChartTooltip from "@/components/charts/ChartTooltip";
import { buildProductsSummary } from "@/services/insightsSnapshot";
import { computeClientKPIs, computeClientAgg, computeClientTopProducts } from "@/lib/client-aggregation";

type SortKey = "product" | "revenue" | "units" | "avgPrice" | "marketShare";

const PAGE_SIZE = 25;

const ProductsPage = () => {
  // Raw data kept only for period comparison + AI summary
  const { data: rawData, loading: rawLoading } = useSellOutData();
  const { data: campaigns } = useCampaignData();
  const { filters, filterSellOut } = useGlobalFilters();
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortAsc, setSortAsc] = useState(false);
  const periodType: PeriodType = "MoM";
  const [page, setPage] = useState(0);

  // Server-side aggregated data via RPC hooks
  const { data: kpis, isLoading: kpisLoading } = useSellOutKPIs(filters);
  const { data: top10Products, isLoading: top10Loading } = useTopProducts(filters, 10);
  const { data: allProducts, isLoading: allProductsLoading } = useTopProducts(filters, 100);
  const { data: categoryAgg, isLoading: categoryLoading } = useSellOutAggregation("category", filters, 6);
  const { data: brandAgg, isLoading: brandLoading } = useSellOutAggregation("brand", filters, 20);

  // Filtered raw data kept for period comparison and AI summary
  const filteredData = useMemo(() => filterSellOut(rawData), [rawData, filterSellOut]);

  // Period-over-period comparison (still uses raw data)
  const comparison = usePeriodComparison(filteredData, campaigns, periodType);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
    setPage(0);
  };

  // ── Client-side fallback when RPCs are unavailable ──
  const clientKpis = useMemo(() => computeClientKPIs(filteredData), [filteredData]);
  const clientTop10 = useMemo(() => computeClientTopProducts(filteredData, 10), [filteredData]);
  const clientAllProducts = useMemo(() => computeClientTopProducts(filteredData, 100), [filteredData]);
  const clientCategoryAgg = useMemo(() => computeClientAgg(filteredData, "category", 6), [filteredData]);
  const clientBrandAgg = useMemo(() => computeClientAgg(filteredData, "brand", 20), [filteredData]);

  // Effective data: prefer RPC, fall back to client-side
  const effectiveKpis = kpis ?? clientKpis;
  const effectiveTop10 = top10Products ?? clientTop10;
  const effectiveAllProducts = allProducts ?? clientAllProducts;
  const effectiveCategoryAgg = categoryAgg ?? clientCategoryAgg;
  const effectiveBrandAgg = brandAgg ?? clientBrandAgg;

  // --- KPI values (server-side RPC with client-side fallback) ---
  const totalRevenue = effectiveKpis.total_revenue;
  const totalUnits = effectiveKpis.total_units;
  const avgOrderValue = totalUnits > 0 ? totalRevenue / totalUnits : 0;
  const uniqueProductCount = effectiveKpis.distinct_products;

  const kpiCards = useMemo(() => [
    { label: "Total Revenue", value: fmtZAR(totalRevenue), icon: DollarSign, delta: comparison.revenue.deltaPct },
    { label: "Units Sold", value: totalUnits.toLocaleString(), icon: ShoppingCart, delta: comparison.units.deltaPct },
    { label: "Avg Order Value", value: fmtZAR(avgOrderValue), icon: Tag, delta: comparison.aov.deltaPct },
    { label: "Unique Products", value: uniqueProductCount.toString(), icon: Package, delta: comparison.products.deltaPct },
  ], [totalRevenue, totalUnits, avgOrderValue, uniqueProductCount, comparison]);

  // Top 10 products mapped for bar chart (with fallback)
  const top10 = useMemo(() =>
    effectiveTop10.map((p) => ({
      name: p.product_name,
      revenue: Math.round(p.total_revenue),
    })),
    [effectiveTop10]
  );

  // Category donut (with fallback)
  const categoryData = useMemo(() => {
    const mapped = effectiveCategoryAgg.map((row) => ({
      name: row.group_key,
      value: Math.round(row.total_revenue),
    }));
    return topNWithOther(mapped, 5, "value", "name");
  }, [effectiveCategoryAgg]);

  // Brand rankings (with fallback)
  const brandTotalRevenue = useMemo(() =>
    effectiveBrandAgg.reduce((s, b) => s + b.total_revenue, 0),
    [effectiveBrandAgg]
  );

  const brandRankings = useMemo(() =>
    effectiveBrandAgg.map((b) => ({
      brand: b.group_key,
      revenue: b.total_revenue,
      marketShare: brandTotalRevenue > 0 ? (b.total_revenue / brandTotalRevenue) * 100 : 0,
    })),
    [effectiveBrandAgg, brandTotalRevenue]
  );

  // Brand chart data (top 8)
  const brandChartData = useMemo(() =>
    brandRankings.slice(0, 8).map((b) => ({
      brand: b.brand,
      revenue: Math.round(b.revenue),
    })),
    [brandRankings]
  );

  // Full product table with sorting (with fallback)
  const productTable = useMemo(() => {
    const arr = effectiveAllProducts.map((p) => ({
      product: p.product_name,
      revenue: p.total_revenue,
      units: p.total_units,
      avgPrice: p.avg_price,
      marketShare: p.market_share,
    }));

    arr.sort((a, b) => {
      const mul = sortAsc ? 1 : -1;
      if (sortKey === "product") return mul * a.product.localeCompare(b.product);
      return mul * ((a[sortKey] as number) - (b[sortKey] as number));
    });
    return arr;
  }, [effectiveAllProducts, sortKey, sortAsc]);

  // Determine overall loading state and data availability
  const isLoading = kpisLoading || top10Loading || categoryLoading || brandLoading || allProductsLoading;
  const hasData = rawData.length > 0 || (kpis?.row_count ?? 0) > 0;

  // AI summary still uses filtered raw data
  const dataSummary = useMemo(() => buildProductsSummary(filteredData)?.summary ?? "", [filteredData]);

  // Data context line from server-side KPIs
  const uniqueProducts = uniqueProductCount;
  const uniqueBrands = useMemo(() => effectiveBrandAgg.length, [effectiveBrandAgg]);
  const dateRange = useMemo(() => {
    const dates = filteredData.map((r) => r.date).filter(Boolean).sort();
    if (dates.length === 0) return "";
    const fmt = (d: string) => new Date(d).toLocaleDateString("en-ZA", { month: "short", year: "numeric" });
    const first = fmt(dates[0]!);
    const last = fmt(dates[dates.length - 1]!);
    return first === last ? first : `${first} \u2013 ${last}`;
  }, [filteredData]);

  // Key finding: top product by revenue
  const keyFinding = useMemo(() => {
    if (top10.length === 0 || totalRevenue === 0) return null;
    const top = top10[0];
    const pct = ((top.revenue / totalRevenue) * 100).toFixed(1);
    return `Top product: ${top.name} at ${fmtZAR(top.revenue)} \u2014 ${pct}% of total revenue`;
  }, [top10, totalRevenue]);

  if (isLoading && rawLoading) return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  if (!hasData && !rawLoading && !isLoading) return <div className="p-8"><EmptyState message="Upload data to see product analytics." /></div>;

  const SortIcon = ({ col }: { col: SortKey }) => (
    <ArrowUpDown className={`inline h-3 w-3 ml-1 cursor-pointer ${sortKey === col ? "text-primary" : "text-muted-foreground/40"}`} onClick={() => handleSort(col)} />
  );

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header with period selector */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Products</h1>
          <p className="text-muted-foreground text-sm">Product and brand performance — market share and mental availability analysis.</p>
          {hasData && dateRange && (
            <p className="text-sm text-muted-foreground mt-1">
              {uniqueProducts.toLocaleString()} products &middot; {uniqueBrands.toLocaleString()} brands &middot; {dateRange}
            </p>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi, i) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            loading={kpisLoading}
            delay={i * 0.06}
            delta={kpi.delta}
            periodLabel={comparison.previousLabel}
          />
        ))}
      </div>

      {keyFinding && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/5 border border-accent/20 text-sm">
          <Lightbulb className="h-4 w-4 text-accent shrink-0" />
          <span className="text-foreground/80">{keyFinding}</span>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top 10 Products */}
        <Card className="glass-card">
          <CardHeader><CardTitle className="font-display text-base">Top 10 Products by Revenue</CardTitle></CardHeader>
          <CardContent>
            {top10Loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT.full}>
                <BarChart data={top10} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid {...chartGridProps} />
                  <XAxis type="number" className={axisClassName} tickFormatter={(v) => fmtZAR(v)} />
                  <YAxis type="category" dataKey="name" className="text-[10px] fill-muted-foreground" width={95} />
                  <Tooltip content={<PremiumChartTooltip />} cursor={chartCursorStyle} />
                  <Bar dataKey="revenue" radius={[0, 4, 4, 0]} animationDuration={CHART_ANIMATION_MS}>
                    {top10.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Category Donut */}
        <Card className="glass-card">
          <CardHeader><CardTitle className="font-display text-base">Revenue by Category</CardTitle></CardHeader>
          <CardContent className="flex justify-center">
            {categoryLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT.full}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={110} dataKey="value" nameKey="name" label={renderPieLabel} labelLine={false} className="text-[10px]" animationDuration={CHART_ANIMATION_MS}>
                    {categoryData.map((entry, i) => <Cell key={entry.name} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<PremiumChartTooltip />} />
                  <text x="50%" y="46%" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: "10px" }}>Total</text>
                  <text x="50%" y="56%" textAnchor="middle" className="fill-foreground font-bold" style={{ fontSize: "14px" }}>{fmtZAR(categoryData.reduce((s, c) => s + c.value, 0))}</text>
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Brands by Revenue */}
      {brandChartData.length > 0 && (
        <Card className="glass-card">
          <CardHeader><CardTitle className="font-display text-base">Top Brands by Revenue</CardTitle></CardHeader>
          <CardContent>
            {brandLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={CHART_HEIGHT.full}>
                <BarChart data={brandChartData} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid {...chartGridProps} />
                  <XAxis type="number" className={axisClassName} tickFormatter={(v) => fmtZAR(v)} />
                  <YAxis type="category" dataKey="brand" className="text-[10px] fill-muted-foreground" width={95} />
                  <Tooltip content={<PremiumChartTooltip />} cursor={chartCursorStyle} />
                  <Bar dataKey="revenue" radius={[0, 4, 4, 0]} name="Revenue" animationDuration={CHART_ANIMATION_MS}>
                    {brandChartData.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Brand Rankings Table */}
      {brandRankings.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="font-display text-base">Brand Rankings — Revenue & Market Share</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-10">#</TableHead>
                    <TableHead className="text-xs">Brand</TableHead>
                    <TableHead className="text-xs text-right">Revenue</TableHead>
                    <TableHead className="text-xs text-right">Market Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brandRankings.slice(0, 20).map((b, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-sm font-medium">{b.brand}</TableCell>
                      <TableCell className="text-sm text-right font-medium">{fmtZAR(b.revenue)}</TableCell>
                      <TableCell className="text-sm text-right">
                        <Badge variant="outline" className="text-[10px] font-semibold">{b.marketShare.toFixed(1)}%</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Product Performance Table with Pagination */}
      <Card>
        <CardHeader><CardTitle className="font-display text-base">Product Performance</CardTitle></CardHeader>
        <CardContent>
          {allProductsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <div className="rounded-lg border overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Product <SortIcon col="product" /></TableHead>
                      <TableHead className="text-xs text-right">Revenue <SortIcon col="revenue" /></TableHead>
                      <TableHead className="text-xs text-right">Units <SortIcon col="units" /></TableHead>
                      <TableHead className="text-xs text-right">Avg Price <SortIcon col="avgPrice" /></TableHead>
                      <TableHead className="text-xs text-right">Share <SortIcon col="marketShare" /></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productTable.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm font-medium max-w-[200px] truncate">{r.product}</TableCell>
                        <TableCell className="text-sm text-right font-medium">{fmtZAR(r.revenue)}</TableCell>
                        <TableCell className="text-sm text-right">{r.units.toLocaleString()}</TableCell>
                        <TableCell className="text-sm text-right">{fmtZAR(r.avgPrice)}</TableCell>
                        <TableCell className="text-sm text-right">{r.marketShare.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {productTable.length > PAGE_SIZE && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <span className="text-xs text-muted-foreground">
                    Showing {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, productTable.length)} of {productTable.length}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= productTable.length} onClick={() => setPage(p => p + 1)}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <SignalStackInsights dataSummary={dataSummary} />
    </div>
  );
};

export default ProductsPage;
