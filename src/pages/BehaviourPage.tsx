import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Inbox, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSellOutData, fmtZAR, aggregate } from "@/hooks/useSellOutData";
import { streamAiChat } from "@/services/aiChatStream";

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const BehaviourPage = () => {
  const { data, loading } = useSellOutData();
  const [segments, setSegments] = useState<{ title: string; desc: string }[]>([]);
  const [segLoading, setSegLoading] = useState(false);
  const hasData = data.length > 0;

  // Sales by day of week
  const dayMap: Record<string, number> = {};
  data.forEach((r) => {
    if (!r.date) return;
    const d = new Date(r.date);
    const day = DAYS[d.getDay()];
    dayMap[day] = (dayMap[day] ?? 0) + Number(r.revenue ?? 0);
  });
  const dayData = DAYS.map((day) => ({ day, revenue: Math.round(dayMap[day] ?? 0) }));

  // Order composition by category (as proxy)
  const revByCategory = aggregate(data, (r) => r.category ?? "Unknown", (r) => Number(r.revenue ?? 0));
  const compData = Object.entries(revByCategory).sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value: Math.round(value) }));

  const chartTooltipStyle = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "0.75rem" };

  const generateSegments = async () => {
    setSegLoading(true);
    setSegments([]);
    const summary = `Day of week sales: ${dayData.map((d) => `${d.day}: ${fmtZAR(d.revenue)}`).join(", ")}. Categories: ${compData.map((c) => `${c.name} (${fmtZAR(c.value)})`).join(", ")}. Total rows: ${data.length}.`;
    let full = "";
    await streamAiChat({
      messages: [{
        role: "user",
        content: `Based on this South African FMCG commerce data, identify 3-4 distinct customer behavioural segments through the lens of behavioural economics (Rory Sutherland). For each segment:
- Give a creative name that captures the behavioural driver
- Describe the purchase pattern and the nudges/context effects that influence their buying behaviour
- Suggest a specific activation strategy using choice architecture, reframing, or contextual nudges (e.g., gondola placement, bundling, social proof, default options)

Format as: **Segment Name**: Description with activation strategy.\n\nData:\n${summary}`,
      }],
      context: "insights",
      onDelta: (t) => { full += t; },
      onDone: () => {
        const segs = full.split("\n").filter((l) => l.includes("**")).map((l) => {
          const match = l.match(/\*\*(.+?)\*\*[:\s]*(.+)/);
          return match ? { title: match[1], desc: match[2] } : null;
        }).filter(Boolean) as { title: string; desc: string }[];
        setSegments(segs.length > 0 ? segs : [{ title: "Analysis", desc: full }]);
        setSegLoading(false);
      },
      onError: () => { setSegments([{ title: "Error", desc: "Unable to generate segments." }]); setSegLoading(false); },
    });
  };

  if (loading) return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  if (!hasData) return <div className="p-8 text-center"><Inbox className="h-10 w-10 mx-auto text-muted-foreground/30 mb-4" /><p className="text-muted-foreground">Upload data to see behavioural analytics.</p></div>;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Behaviour</h1>
        <p className="text-muted-foreground text-sm">Behavioural intelligence — understanding the nudges that drive purchase decisions.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Order Composition */}
        <Card>
          <CardHeader><CardTitle className="font-display text-base">Order Composition</CardTitle></CardHeader>
          <CardContent className="flex justify-center">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={compData} cx="50%" cy="50%" innerRadius={55} outerRadius={105} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} className="text-[10px]">
                  {compData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [fmtZAR(v), "Revenue"]} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Sales by Day of Week */}
        <Card>
          <CardHeader><CardTitle className="font-display text-base">Sales Distribution by Day of Week</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dayData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" className="text-xs fill-muted-foreground" />
                <YAxis className="text-xs fill-muted-foreground" tickFormatter={(v) => fmtZAR(v)} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [fmtZAR(v), "Revenue"]} />
                <Bar dataKey="revenue" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Customer Segments */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <h3 className="font-display text-sm font-bold">Customer Segments — Pot Labs Intelligence</h3>
            </div>
            <Button size="sm" variant="outline" onClick={generateSegments} disabled={segLoading} className="text-xs">
              {segLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
              Generate Segments
            </Button>
          </div>
          {segments.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-3">
              {segments.map((seg, i) => (
                <div key={i} className="border-l-3 border-accent bg-accent/5 rounded-r-lg p-4">
                  <p className="font-display text-sm font-bold mb-1">{seg.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{seg.desc}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Click "Generate Segments" to identify customer behavioural patterns.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BehaviourPage;
