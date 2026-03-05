import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { fmtZAR } from "@/hooks/useSellOutData";
import type { SellOutRow } from "@/hooks/useSellOutData";
import { CHART_PALETTE, CHART_ANIMATION_MS } from "@/lib/chart-utils";
import PremiumChartTooltip from "@/components/charts/ChartTooltip";

type Dimension = "brand" | "retailer" | "category";

interface ShareOfVoicePanelProps {
  data: SellOutRow[];
}

const DIMENSION_LABELS: Record<Dimension, string> = {
  brand: "Brand",
  retailer: "Retailer",
  category: "Category",
};

const ShareOfVoicePanel = ({ data }: ShareOfVoicePanelProps) => {
  const [dimension, setDimension] = useState<Dimension>("brand");

  const sovData = useMemo(() => {
    const map: Record<string, { revenue: number; units: number }> = {};

    for (const row of data) {
      const key =
        (dimension === "brand"
          ? row.brand
          : dimension === "retailer"
            ? row.retailer
            : row.category) ?? "Unknown";

      if (!map[key]) map[key] = { revenue: 0, units: 0 };
      map[key].revenue += Number(row.revenue ?? 0);
      map[key].units += Number(row.units_sold ?? 0);
    }

    const totalRevenue = Object.values(map).reduce(
      (s, v) => s + v.revenue,
      0,
    );
    const totalUnits = Object.values(map).reduce((s, v) => s + v.units, 0);

    return Object.entries(map)
      .map(([name, v]) => ({
        name,
        revenue: v.revenue,
        units: v.units,
        revenueShare:
          totalRevenue > 0 ? (v.revenue / totalRevenue) * 100 : 0,
        unitsShare: totalUnits > 0 ? (v.units / totalUnits) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [data, dimension]);

  // For the pie chart, show top 7 and group the rest as "Other"
  const chartData = useMemo(() => {
    if (sovData.length <= 8) return sovData;

    const top = sovData.slice(0, 7);
    const rest = sovData.slice(7);
    const otherRevenue = rest.reduce((s, v) => s + v.revenue, 0);
    const otherUnits = rest.reduce((s, v) => s + v.units, 0);
    const totalRevenue = sovData.reduce((s, v) => s + v.revenue, 0);
    const totalUnits = sovData.reduce((s, v) => s + v.units, 0);

    return [
      ...top,
      {
        name: "Other",
        revenue: otherRevenue,
        units: otherUnits,
        revenueShare:
          totalRevenue > 0 ? (otherRevenue / totalRevenue) * 100 : 0,
        unitsShare:
          totalUnits > 0 ? (otherUnits / totalUnits) * 100 : 0,
      },
    ];
  }, [sovData]);

  if (data.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-display text-base">
          Share of Voice
        </CardTitle>
        <Select
          value={dimension}
          onValueChange={(v) => setDimension(v as Dimension)}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="brand">Brand</SelectItem>
            <SelectItem value="retailer">Retailer</SelectItem>
            <SelectItem value="category">Category</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-6">
          {/* Donut Chart */}
          <div>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="revenue"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={110}
                  paddingAngle={2}
                  animationDuration={CHART_ANIMATION_MS}
                >
                  {chartData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={CHART_PALETTE[i % CHART_PALETTE.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={
                    <PremiumChartTooltip
                      formatter={(v: number) => fmtZAR(v)}
                    />
                  }
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Summary Table */}
          <div className="rounded-lg border overflow-auto max-h-[280px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">
                    {DIMENSION_LABELS[dimension]}
                  </TableHead>
                  <TableHead className="text-xs text-right">
                    Revenue
                  </TableHead>
                  <TableHead className="text-xs text-right">
                    Rev %
                  </TableHead>
                  <TableHead className="text-xs text-right">
                    Units
                  </TableHead>
                  <TableHead className="text-xs text-right">
                    Units %
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sovData.slice(0, 15).map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">
                      {row.name}
                    </TableCell>
                    <TableCell className="text-sm text-right">
                      {fmtZAR(row.revenue)}
                    </TableCell>
                    <TableCell className="text-sm text-right font-semibold">
                      {row.revenueShare.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-sm text-right">
                      {row.units.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-right">
                      {row.unitsShare.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ShareOfVoicePanel;
