import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { ShoppingCart, TrendingUp, DollarSign, Package, Upload, Inbox } from "lucide-react";
import { Link } from "react-router-dom";

type Sale = { date: string; sku: string; product_name: string; channel: string; revenue: number; units_sold: number; returns: number; cost: number };

const SalesExplorer = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState("all");
  const [skuFilter, setSkuFilter] = useState("all");

  useEffect(() => {
    const fetchSales = async () => {
      setLoading(true);
      const { data } = await supabase.from("harmonized_sales").select("*").order("date", { ascending: false }).limit(500);
      setSales((data ?? []).map((d) => ({
        date: d.date, sku: d.sku ?? "", product_name: d.product_name ?? "", channel: d.channel ?? "",
        revenue: Number(d.revenue) || 0, units_sold: d.units_sold ?? 0, returns: d.returns ?? 0, cost: Number(d.cost) || 0,
      })));
      setLoading(false);
    };
    fetchSales();
  }, []);

  const channels = [...new Set(sales.map((s) => s.channel))];
  const skus = [...new Set(sales.map((s) => s.sku))];

  const filtered = sales.filter((s) => {
    if (channelFilter !== "all" && s.channel !== channelFilter) return false;
    if (skuFilter !== "all" && s.sku !== skuFilter) return false;
    return true;
  });

  const totalRevenue = filtered.reduce((a, b) => a + b.revenue, 0);
  const totalUnits = filtered.reduce((a, b) => a + b.units_sold, 0);
  const totalReturns = filtered.reduce((a, b) => a + b.returns, 0);
  const avgMargin = totalRevenue > 0 ? ((totalRevenue - filtered.reduce((a, b) => a + b.cost, 0)) / totalRevenue * 100) : 0;

  const channelBreakdown = channels.map((ch) => {
    const channelSales = filtered.filter((s) => s.channel === ch);
    return { channel: ch, revenue: channelSales.reduce((a, b) => a + b.revenue, 0), units: channelSales.reduce((a, b) => a + b.units_sold, 0) };
  }).sort((a, b) => b.revenue - a.revenue);

  const hasData = sales.length > 0;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Sales Explorer</h1>
          <p className="text-muted-foreground text-sm">Filter and drill into sales by retailer, SKU, and time period.</p>
        </div>
        {hasData && (
          <div className="flex gap-3">
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Channel" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                {channels.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={skuFilter} onValueChange={setSkuFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="SKU" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All SKUs</SelectItem>
                {skus.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map((i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>)}
        </div>
      ) : !hasData ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Inbox className="h-10 w-10 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground mb-3">Upload sell-out data to explore sales performance.</p>
            <Link to="/upload"><Button variant="outline" size="sm"><Upload className="h-3.5 w-3.5 mr-1.5" />Go to Upload Hub</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Revenue", value: `$${(totalRevenue / 1000).toFixed(1)}K`, icon: DollarSign },
              { label: "Units Sold", value: totalUnits.toLocaleString(), icon: ShoppingCart },
              { label: "Returns", value: totalReturns.toLocaleString(), icon: Package },
              { label: "Gross Margin", value: `${avgMargin.toFixed(1)}%`, icon: TrendingUp },
            ].map((k) => (
              <Card key={k.label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center"><k.icon className="h-4 w-4 text-primary" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                    <p className="font-display text-xl font-bold">{k.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {channelBreakdown.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="font-display text-lg">Revenue by Channel</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={channelBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="channel" className="text-xs fill-muted-foreground" />
                    <YAxis className="text-xs fill-muted-foreground" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "0.875rem" }} formatter={(v: number) => [`$${(v / 1000).toFixed(1)}K`]} />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="font-display text-lg">Sales Details</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead><TableHead>SKU</TableHead><TableHead>Product</TableHead><TableHead>Channel</TableHead>
                      <TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Units</TableHead><TableHead className="text-right">Returns</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((s, i) => (
                      <TableRow key={i}>
                        <TableCell className="whitespace-nowrap">{s.date}</TableCell>
                        <TableCell><Badge variant="outline">{s.sku}</Badge></TableCell>
                        <TableCell>{s.product_name}</TableCell>
                        <TableCell>{s.channel}</TableCell>
                        <TableCell className="text-right font-medium">${s.revenue.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{s.units_sold}</TableCell>
                        <TableCell className="text-right">{s.returns}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default SalesExplorer;
