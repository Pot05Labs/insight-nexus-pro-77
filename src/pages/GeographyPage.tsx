import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import SignalStackInsights from "@/components/SignalStackInsights";
import EmptyState from "@/components/EmptyState";
import ExportCsvButton from "@/components/ExportCsvButton";
import { useSellOutData, fmtZAR, aggregate } from "@/hooks/useSellOutData";
import { chartCursorStyle, chartGridProps, CHART_ANIMATION_MS, CHART_HEIGHT, axisClassName, CHART_PALETTE } from "@/lib/chart-utils";
import PremiumChartTooltip from "@/components/charts/ChartTooltip";

const GeographyPage = () => {
  const { data, loading } = useSellOutData();
  const hasData = data.length > 0;

  // Top 5 stores
  const revByStore = aggregate(data, (r) => r.store_location ?? "Unknown", (r) => Number(r.revenue ?? 0));
  const storeData = Object.entries(revByStore).sort(([, a], [, b]) => b - a).slice(0, 5)
    .map(([store, revenue]) => ({ store, revenue: Math.round(revenue) }));

  // Infer region: use region field, or extract area from store_location ("Makro - Strubens Valley" → "Strubens Valley")
  const inferRegion = (r: typeof data[0]): string => {
    if (r.region) return r.region;
    const loc = r.store_location?.trim();
    if (!loc) return "Unknown";
    // Extract area after dash (e.g., "Makro - Silver Lakes" → "Silver Lakes")
    const dashIdx = loc.indexOf(" - ");
    if (dashIdx !== -1) return loc.slice(dashIdx + 3).trim() || loc;
    return loc;
  };

  // Revenue by province/region
  const revByRegion = aggregate(data, inferRegion, (r) => Number(r.revenue ?? 0));
  const regionData = Object.entries(revByRegion).sort(([, a], [, b]) => b - a)
    .map(([region, revenue]) => ({ region, revenue: Math.round(revenue) }));

  // Province performance table
  const unitsByRegion = aggregate(data, inferRegion, (r) => Number(r.units_sold ?? 0));
  const provinceTable = regionData.map((r) => ({
    region: r.region,
    revenue: r.revenue,
    units: unitsByRegion[r.region] ?? 0,
    aov: (unitsByRegion[r.region] ?? 0) > 0 ? r.revenue / unitsByRegion[r.region] : 0,
  }));

  const dataSummary = `Top Stores: ${storeData.map((s) => `${s.store} (${fmtZAR(s.revenue)})`).join(", ")}. Regions: ${regionData.map((r) => `${r.region} (${fmtZAR(r.revenue)})`).join(", ")}.`;

  if (loading) return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  if (!hasData) return <div className="p-8"><EmptyState message="Upload data to see geographic analytics." /></div>;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Geography</h1>
        <p className="text-muted-foreground text-sm">Geographic performance — regional context effects and store-level analysis.</p>
      </div>
      <div className="flex items-center gap-3">
        <ExportCsvButton
          filename="Geography"
          headers={["Province", "Revenue", "Units", "AOV"]}
          rows={provinceTable.map((r) => [r.region, r.revenue, r.units, r.aov.toFixed(2)])}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="glass-card">
          <CardHeader><CardTitle className="font-display text-base">Top 5 Stores by Revenue</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT.half}>
              <BarChart data={storeData} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid {...chartGridProps} />
                <XAxis type="number" className={axisClassName} tickFormatter={(v) => fmtZAR(v)} />
                <YAxis type="category" dataKey="store" className="text-[10px] fill-muted-foreground" width={95} />
                <Tooltip content={<PremiumChartTooltip />} cursor={chartCursorStyle} />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]} animationDuration={CHART_ANIMATION_MS}>
                  {storeData.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader><CardTitle className="font-display text-base">Revenue by Province</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT.half}>
              <BarChart data={regionData}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="region" className={axisClassName} angle={-20} textAnchor="end" height={50} interval={0} />
                <YAxis className={axisClassName} tickFormatter={(v) => fmtZAR(v)} />
                <Tooltip content={<PremiumChartTooltip />} cursor={chartCursorStyle} />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]} animationDuration={CHART_ANIMATION_MS}>
                  {regionData.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Province Performance Table */}
      <Card>
        <CardHeader><CardTitle className="font-display text-base">Province Performance</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Province</TableHead>
                  <TableHead className="text-xs text-right">Revenue</TableHead>
                  <TableHead className="text-xs text-right">Units</TableHead>
                  <TableHead className="text-xs text-right">AOV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {provinceTable.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{r.region}</TableCell>
                    <TableCell className="text-sm text-right font-medium">{fmtZAR(r.revenue)}</TableCell>
                    <TableCell className="text-sm text-right">{r.units.toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-right">{fmtZAR(r.aov)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <SignalStackInsights dataSummary={dataSummary} title="Geographic Insights" />
    </div>
  );
};

export default GeographyPage;
