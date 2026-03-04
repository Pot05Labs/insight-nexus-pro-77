import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, Lightbulb } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import SignalStackInsights from "@/components/SignalStackInsights";
import ExportCsvButton from "@/components/ExportCsvButton";
import { useSellOutData, fmtZAR, aggregate } from "@/hooks/useSellOutData";
import { chartCursorStyle, chartGridProps, CHART_ANIMATION_MS, CHART_HEIGHT, axisClassName, renderPieLabel, DONUT_COLORS, CHART_PALETTE, topNWithOther } from "@/lib/chart-utils";
import PremiumChartTooltip from "@/components/charts/ChartTooltip";

type SortKey = "product" | "brand" | "category" | "revenue" | "units" | "avgPrice" | "marketShare";

const ProductsPage = () => {
  const { data, loading } = useSellOutData();
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  // Top 10 products by revenue
  const revByProduct = aggregate(data, (r) => r.product_name_raw ?? "Unknown", (r) => Number(r.revenue ?? 0));
  const top10 = Object.entries(revByProduct).sort(([, a], [, b]) => b - a).slice(0, 10)
    .map(([name, revenue]) => ({ name, revenue: Math.round(revenue) }));

  // Category donut
  const revByCategory = aggregate(data, (r) => r.category ?? "Unknown", (r) => Number(r.revenue ?? 0));
  const categoryData = topNWithOther(
    Object.entries(revByCategory).sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value: Math.round(value) })),
    5, "value", "name"
  );

  // Brand inference: extract from product name if brand field is null
  const inferBrand = (r: typeof data[0]): string => {
    if (r.brand) return r.brand;
    const name = r.product_name_raw?.trim();
    if (!name) return r.retailer ?? "Unknown";
    const firstWord = name.split(/\s+/)[0];
    return firstWord && firstWord.length > 1 ? firstWord : "Unknown";
  };

  // Brand rankings with market share
  const revByBrand = aggregate(data, inferBrand, (r) => Number(r.revenue ?? 0));
  const totalRevenue = Object.values(revByBrand).reduce((s, v) => s + v, 0);

  const brandRankings = useMemo(() => {
    const arr = Object.entries(revByBrand).map(([brand, revenue]) => ({
      brand,
      revenue,
      marketShare: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
    }));
    arr.sort((a, b) => b.revenue - a.revenue);
    return arr;
  }, [revByBrand, totalRevenue]);

  // Brand chart data (top 10)
  const brandChartData = brandRankings.slice(0, 8).map((b) => ({
    brand: b.brand,
    revenue: Math.round(b.revenue),
  }));

  // Full product table with market share
  const productTable = useMemo(() => {
    const totalProductRev = data.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
    const map: Record<string, { brand: string; category: string; revenue: number; units: number }> = {};
    data.forEach((r) => {
      const p = r.product_name_raw ?? "Unknown";
      if (!map[p]) map[p] = { brand: inferBrand(r), category: r.category ?? "—", revenue: 0, units: 0 };
      map[p].revenue += Number(r.revenue ?? 0);
      map[p].units += Number(r.units_sold ?? 0);
    });
    const arr = Object.entries(map).map(([product, v]) => ({
      product, ...v,
      avgPrice: v.units > 0 ? v.revenue / v.units : 0,
      marketShare: totalProductRev > 0 ? (v.revenue / totalProductRev) * 100 : 0,
    }));

    arr.sort((a, b) => {
      const mul = sortAsc ? 1 : -1;
      if (sortKey === "product") return mul * a.product.localeCompare(b.product);
      if (sortKey === "brand") return mul * a.brand.localeCompare(b.brand);
      if (sortKey === "category") return mul * a.category.localeCompare(b.category);
      if (sortKey === "marketShare") return mul * (a.marketShare - b.marketShare);
      return mul * ((a[sortKey] as number) - (b[sortKey] as number));
    });
    return arr;
  }, [data, sortKey, sortAsc]);

  const hasData = data.length > 0;

  const dataSummary = `Top 10 Products: ${top10.map((p) => `${p.name} (${fmtZAR(p.revenue)})`).join(", ")}. Categories: ${categoryData.map((c) => `${c.name} (${fmtZAR(c.value)})`).join(", ")}. Brand rankings: ${brandRankings.slice(0, 5).map((b) => `${b.brand} (${fmtZAR(b.revenue)}, ${b.marketShare.toFixed(1)}% share)`).join(", ")}. Total Revenue: ${fmtZAR(totalRevenue)}.`;

  // Data context line
  const uniqueProducts = useMemo(() => new Set(data.map((r) => r.product_name_raw).filter(Boolean)).size, [data]);
  const uniqueBrands = useMemo(() => new Set(data.map((r) => inferBrand(r)).filter(Boolean)).size, [data]);
  const dateRange = useMemo(() => {
    const dates = data.map((r) => r.date).filter(Boolean).sort();
    if (dates.length === 0) return "";
    const fmt = (d: string) => new Date(d).toLocaleDateString("en-ZA", { month: "short", year: "numeric" });
    const first = fmt(dates[0]!);
    const last = fmt(dates[dates.length - 1]!);
    return first === last ? first : `${first} \u2013 ${last}`;
  }, [data]);

  // Key finding: top product by revenue
  const keyFinding = useMemo(() => {
    if (top10.length === 0 || totalRevenue === 0) return null;
    const top = top10[0];
    const pct = ((top.revenue / totalRevenue) * 100).toFixed(1);
    return `Top product: ${top.name} at ${fmtZAR(top.revenue)} \u2014 ${pct}% of total revenue`;
  }, [top10, totalRevenue]);

  if (loading) return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  if (!hasData) return <div className="p-8"><EmptyState message="Upload data to see product analytics." /></div>;

  const SortIcon = ({ col }: { col: SortKey }) => (
    <ArrowUpDown className={`inline h-3 w-3 ml-1 cursor-pointer ${sortKey === col ? "text-primary" : "text-muted-foreground/40"}`} onClick={() => handleSort(col)} />
  );

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Products</h1>
        <p className="text-muted-foreground text-sm">Product and brand performance — market share and mental availability analysis.</p>
        {hasData && dateRange && (
          <p className="text-sm text-muted-foreground mt-1">
            {uniqueProducts.toLocaleString()} products &middot; {uniqueBrands.toLocaleString()} brands &middot; {dateRange}
          </p>
        )}
      </div>
      {keyFinding && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/5 border border-accent/20 text-sm">
          <Lightbulb className="h-4 w-4 text-accent shrink-0" />
          <span className="text-foreground/80">{keyFinding}</span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <ExportCsvButton
          filename="Products"
          headers={["Product", "Brand", "Category", "Revenue", "Units", "Avg Price", "Market Share %"]}
          rows={productTable.map((p) => [p.product, p.brand, p.category, p.revenue, p.units, p.avgPrice.toFixed(2), p.marketShare.toFixed(1)])}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top 10 Products */}
        <Card className="glass-card">
          <CardHeader><CardTitle className="font-display text-base">Top 10 Products by Revenue</CardTitle></CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        {/* Category Donut */}
        <Card className="glass-card">
          <CardHeader><CardTitle className="font-display text-base">Revenue by Category</CardTitle></CardHeader>
          <CardContent className="flex justify-center">
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
          </CardContent>
        </Card>
      </div>

      {/* Top Brands by Revenue */}
      {brandChartData.length > 0 && (
        <Card className="glass-card">
          <CardHeader><CardTitle className="font-display text-base">Top Brands by Revenue</CardTitle></CardHeader>
          <CardContent>
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
                    <TableCell className="text-sm text-right">{r.marketShare.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <SignalStackInsights dataSummary={dataSummary} />
    </div>
  );
};

export default ProductsPage;
