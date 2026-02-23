import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import PotLabsInsights from "@/components/PotLabsInsights";
import PeriodSelector from "@/components/PeriodSelector";
import DeltaIndicator from "@/components/DeltaIndicator";
import { useSellOutData, fmtZAR, aggregate } from "@/hooks/useSellOutData";
import {
  type PeriodMode,
  getPeriodRanges,
  filterByDateRange,
  computeDelta,
  findLatestDate,
  detectBestPeriodMode,
} from "@/lib/period-utils";

const COLORS = [
  "hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(175 65% 45%)",
  "hsl(38 80% 60%)", "hsl(262 40% 55%)", "hsl(199 60% 55%)", "hsl(349 55% 60%)",
];

type SortKey = "product" | "brand" | "category" | "revenue" | "units" | "avgPrice" | "growth" | "marketShare";

const ProductsPage = () => {
  const { data, loading } = useSellOutData();
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortAsc, setSortAsc] = useState(false);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("MoM");

  useMemo(() => {
    if (data.length > 0) setPeriodMode(detectBestPeriodMode(data));
  }, [data.length]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const periodRanges = useMemo(() => {
    const refDate = findLatestDate(data);
    return getPeriodRanges(refDate, periodMode);
  }, [data, periodMode]);

  const currentData = useMemo(() => filterByDateRange(data, periodRanges.current), [data, periodRanges]);
  const previousData = useMemo(() => filterByDateRange(data, periodRanges.previous), [data, periodRanges]);

  // Top 10 products by revenue
  const revByProduct = aggregate(data, (r) => r.product_name_raw ?? "Unknown", (r) => Number(r.revenue ?? 0));
  const top10 = Object.entries(revByProduct).sort(([, a], [, b]) => b - a).slice(0, 10)
    .map(([name, revenue]) => ({ name, revenue: Math.round(revenue) }));

  // Category donut
  const revByCategory = aggregate(data, (r) => r.category ?? "Unknown", (r) => Number(r.revenue ?? 0));
  const categoryData = Object.entries(revByCategory).sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value: Math.round(value) }));

  // Brand benchmarking: growth rate and market share
  const curRevByBrand = aggregate(currentData, (r) => r.brand ?? "Unknown", (r) => Number(r.revenue ?? 0));
  const prevRevByBrand = aggregate(previousData, (r) => r.brand ?? "Unknown", (r) => Number(r.revenue ?? 0));
  const totalCurRevenue = Object.values(curRevByBrand).reduce((s, v) => s + v, 0);

  const brandBenchmark = useMemo(() => {
    const allBrands = new Set([...Object.keys(curRevByBrand), ...Object.keys(prevRevByBrand)]);
    const arr = [...allBrands].map((brand) => {
      const curRev = curRevByBrand[brand] ?? 0;
      const prevRev = prevRevByBrand[brand] ?? 0;
      const growth = computeDelta(curRev, prevRev);
      const marketShare = totalCurRevenue > 0 ? (curRev / totalCurRevenue) * 100 : 0;
      return { brand, curRev, prevRev, growth, marketShare };
    });
    arr.sort((a, b) => b.curRev - a.curRev);
    return arr;
  }, [curRevByBrand, prevRevByBrand, totalCurRevenue]);

  // Brand benchmark chart (top 10 brands by current period revenue with growth)
  const brandChartData = brandBenchmark.slice(0, 10).map((b) => ({
    brand: b.brand,
    current: Math.round(b.curRev),
    previous: Math.round(b.prevRev),
  }));

  // Full product table with growth and market share
  const productTable = useMemo(() => {
    const curRevByProduct = aggregate(currentData, (r) => r.product_name_raw ?? "Unknown", (r) => Number(r.revenue ?? 0));
    const prevRevByProduct = aggregate(previousData, (r) => r.product_name_raw ?? "Unknown", (r) => Number(r.revenue ?? 0));
    const totalCurProductRev = Object.values(curRevByProduct).reduce((s, v) => s + v, 0);

    const map: Record<string, { brand: string; category: string; revenue: number; units: number }> = {};
    data.forEach((r) => {
      const p = r.product_name_raw ?? "Unknown";
      if (!map[p]) map[p] = { brand: r.brand ?? "—", category: r.category ?? "—", revenue: 0, units: 0 };
      map[p].revenue += Number(r.revenue ?? 0);
      map[p].units += Number(r.units_sold ?? 0);
    });
    const arr = Object.entries(map).map(([product, v]) => ({
      product, ...v,
      avgPrice: v.units > 0 ? v.revenue / v.units : 0,
      growth: computeDelta(curRevByProduct[product] ?? 0, prevRevByProduct[product] ?? 0),
      marketShare: totalCurProductRev > 0 ? ((curRevByProduct[product] ?? 0) / totalCurProductRev) * 100 : 0,
    }));

    arr.sort((a, b) => {
      const mul = sortAsc ? 1 : -1;
      if (sortKey === "product") return mul * a.product.localeCompare(b.product);
      if (sortKey === "brand") return mul * a.brand.localeCompare(b.brand);
      if (sortKey === "category") return mul * a.category.localeCompare(b.category);
      if (sortKey === "growth") return mul * ((a.growth ?? 0) - (b.growth ?? 0));
      if (sortKey === "marketShare") return mul * (a.marketShare - b.marketShare);
      return mul * ((a[sortKey] as number) - (b[sortKey] as number));
    });
    return arr;
  }, [data, currentData, previousData, sortKey, sortAsc]);

  const chartTooltipStyle = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "0.75rem" };
  const hasData = data.length > 0;

  const dataSummary = `Top 10 Products: ${top10.map((p) => `${p.name} (${fmtZAR(p.revenue)})`).join(", ")}. Categories: ${categoryData.map((c) => `${c.name} (${fmtZAR(c.value)})`).join(", ")}. Brand rankings: ${brandBenchmark.slice(0, 5).map((b) => `${b.brand} (${fmtZAR(b.curRev)}, ${b.growth !== null ? `${b.growth > 0 ? "+" : ""}${b.growth.toFixed(1)}% growth` : "N/A"}, ${b.marketShare.toFixed(1)}% share)`).join(", ")}. Period: ${periodRanges.current.label} vs ${periodRanges.previous.label}.`;

  if (loading) return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  if (!hasData) return <div className="p-8 text-center"><Inbox className="h-10 w-10 mx-auto text-muted-foreground/30 mb-4" /><p className="text-muted-foreground">Upload data to see product analytics.</p></div>;

  const SortIcon = ({ col }: { col: SortKey }) => (
    <ArrowUpDown className={`inline h-3 w-3 ml-1 cursor-pointer ${sortKey === col ? "text-primary" : "text-muted-foreground/40"}`} onClick={() => handleSort(col)} />
  );

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Products</h1>
          <p className="text-muted-foreground text-sm">Product and category performance analysis.</p>
        </div>
        <PeriodSelector value={periodMode} onChange={setPeriodMode} />
      </div>

      <p className="text-xs text-muted-foreground">
        Comparing <span className="font-semibold text-foreground">{periodRanges.current.label}</span> vs <span className="font-semibold text-foreground">{periodRanges.previous.label}</span>
      </p>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top 10 Products */}
        <Card>
          <CardHeader><CardTitle className="font-display text-base">Top 10 Products by Revenue</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={top10} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" className="text-xs fill-muted-foreground" tickFormatter={(v) => fmtZAR(v)} />
                <YAxis type="category" dataKey="name" className="text-[10px] fill-muted-foreground" width={95} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [fmtZAR(v), "Revenue"]} />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category Donut */}
        <Card>
          <CardHeader><CardTitle className="font-display text-base">Revenue by Category</CardTitle></CardHeader>
          <CardContent className="flex justify-center">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={110} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} className="text-[10px]">
                  {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [fmtZAR(v), "Revenue"]} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Brand Benchmarking — Period Comparison */}
      {brandChartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="font-display text-base">Brand Benchmarking — Period Comparison</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={brandChartData} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" className="text-xs fill-muted-foreground" tickFormatter={(v) => fmtZAR(v)} />
                <YAxis type="category" dataKey="brand" className="text-[10px] fill-muted-foreground" width={95} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, name: string) => [fmtZAR(v), name]} />
                <Legend />
                <Bar dataKey="current" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name={periodRanges.current.label} />
                <Bar dataKey="previous" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} name={periodRanges.previous.label} opacity={0.5} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Brand Rankings Table */}
      {brandBenchmark.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="font-display text-base">Brand Rankings — Growth & Market Share</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-10">#</TableHead>
                    <TableHead className="text-xs">Brand</TableHead>
                    <TableHead className="text-xs text-right">Current Revenue</TableHead>
                    <TableHead className="text-xs text-right">Previous Revenue</TableHead>
                    <TableHead className="text-xs text-right">Growth</TableHead>
                    <TableHead className="text-xs text-right">Market Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brandBenchmark.slice(0, 20).map((b, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-sm font-medium">{b.brand}</TableCell>
                      <TableCell className="text-sm text-right font-medium">{fmtZAR(b.curRev)}</TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground">{fmtZAR(b.prevRev)}</TableCell>
                      <TableCell className="text-right">
                        <DeltaIndicator delta={b.growth} />
                      </TableCell>
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

      {/* Product Performance Table */}
      <Card>
        <CardHeader><CardTitle className="font-display text-base">Product Performance</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Product <SortIcon col="product" /></TableHead>
                  <TableHead className="text-xs">Brand <SortIcon col="brand" /></TableHead>
                  <TableHead className="text-xs">Category <SortIcon col="category" /></TableHead>
                  <TableHead className="text-xs text-right">Revenue <SortIcon col="revenue" /></TableHead>
                  <TableHead className="text-xs text-right">Units <SortIcon col="units" /></TableHead>
                  <TableHead className="text-xs text-right">Avg Price <SortIcon col="avgPrice" /></TableHead>
                  <TableHead className="text-xs text-right">Growth <SortIcon col="growth" /></TableHead>
                  <TableHead className="text-xs text-right">Share <SortIcon col="marketShare" /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productTable.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium max-w-[200px] truncate">{r.product}</TableCell>
                    <TableCell className="text-sm">{r.brand}</TableCell>
                    <TableCell className="text-sm">{r.category}</TableCell>
                    <TableCell className="text-sm text-right font-medium">{fmtZAR(r.revenue)}</TableCell>
                    <TableCell className="text-sm text-right">{r.units.toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-right">{fmtZAR(r.avgPrice)}</TableCell>
                    <TableCell className="text-right"><DeltaIndicator delta={r.growth} /></TableCell>
                    <TableCell className="text-sm text-right">{r.marketShare.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <PotLabsInsights dataSummary={dataSummary} />
    </div>
  );
};

export default ProductsPage;
