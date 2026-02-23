import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, TrendingUp, TrendingDown, Sparkles, Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from "recharts";
import { detectAnomalies, buildDailyRevenueSeries, type AnomalyPoint } from "@/lib/anomaly-utils";
import { fmtZAR } from "@/hooks/useSellOutData";
import { streamAiChat } from "@/services/aiChatStream";
import type { SellOutRow } from "@/hooks/useSellOutData";

interface AnomalyDetectionPanelProps {
  data: SellOutRow[];
}

const severityConfig = {
  high: { color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800" },
  medium: { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800" },
  low: { color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-800" },
};

const AnomalyDetectionPanel = ({ data }: AnomalyDetectionPanelProps) => {
  const [aiExplanation, setAiExplanation] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const revenueSeries = useMemo(() => buildDailyRevenueSeries(data), [data]);
  const result = useMemo(() => detectAnomalies(revenueSeries, "Revenue", 2.0), [revenueSeries]);

  // Chart data with anomaly markers
  const chartData = useMemo(() => {
    const anomalyDates = new Set(result.anomalies.map((a) => a.date));
    return revenueSeries.map((point) => ({
      ...point,
      isAnomaly: anomalyDates.has(point.date),
      anomalyValue: anomalyDates.has(point.date) ? point.value : undefined,
    }));
  }, [revenueSeries, result.anomalies]);

  const generateExplanation = async () => {
    if (result.anomalies.length === 0) return;
    setAiLoading(true);
    setAiExplanation("");
    let full = "";

    const anomalySummary = result.anomalies.map((a) => a.description).join("\n");

    await streamAiChat({
      messages: [{
        role: "user",
        content: `You are the Commerce Intelligence Harmoniser for South African FMCG brands. Analyse these detected anomalies using the What/So What/Now What framework.\n\nAnomalies detected:\n${anomalySummary}\n\nDataset mean: ${fmtZAR(result.mean)}/day, Std Dev: ${fmtZAR(result.stdDev)}, Total data points: ${result.totalPoints} days.\n\nFor each anomaly:\n- WHAT happened (the data anomaly with exact numbers in ZAR)\n- SO WHAT it means (campaign impact? retailer action? seasonal effect? choice architecture change? stock issue?)\n- NOW WHAT to do (specific activation, budget shift, creative change, or retailer conversation)\n\nConsider behavioural economics factors: gondola placement changes, promotional mechanics, bundle offers, or context effects that may explain shifts. Be concise — 2-3 sentences per anomaly.`,
      }],
      context: "insights",
      onDelta: (t) => { full += t; setAiExplanation(full); },
      onDone: () => { setAiLoading(false); },
      onError: () => { setAiExplanation("Unable to generate AI explanation. Check API configuration."); setAiLoading(false); },
    });
  };

  if (revenueSeries.length < 5) return null;

  const chartTooltipStyle = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem", fontSize: "0.75rem" };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Anomaly Detection
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {result.anomalies.length} anomal{result.anomalies.length === 1 ? "y" : "ies"} detected
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Revenue chart with anomaly highlights */}
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" className="text-[10px] fill-muted-foreground" tickFormatter={(d) => d.slice(5)} />
            <YAxis className="text-xs fill-muted-foreground" tickFormatter={(v) => fmtZAR(v)} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [fmtZAR(v), "Revenue"]} labelFormatter={(l) => `Date: ${l}`} />
            <ReferenceLine y={result.mean} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: "Avg", position: "right", className: "text-[10px] fill-muted-foreground" }} />
            <ReferenceLine y={result.mean + 2 * result.stdDev} stroke="hsl(var(--chart-4))" strokeDasharray="2 2" opacity={0.5} />
            <ReferenceLine y={Math.max(0, result.mean - 2 * result.stdDev)} stroke="hsl(var(--chart-4))" strokeDasharray="2 2" opacity={0.5} />
            <Line dataKey="value" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} name="Revenue" />
            <Line dataKey="anomalyValue" stroke="hsl(var(--destructive))" strokeWidth={0} dot={{ r: 5, fill: "hsl(var(--destructive))", stroke: "hsl(var(--destructive))" }} name="Anomaly" />
          </LineChart>
        </ResponsiveContainer>

        {/* Anomaly list */}
        {result.anomalies.length > 0 ? (
          <div className="space-y-2">
            {result.anomalies.slice(0, 8).map((anomaly, i) => {
              const config = severityConfig[anomaly.severity];
              const Icon = anomaly.type === "spike" ? TrendingUp : TrendingDown;
              return (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${config.bg} ${config.border}`}>
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{anomaly.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px]">{anomaly.severity}</Badge>
                      <span className="text-[10px] text-muted-foreground">z-score: {anomaly.zScore.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* AI Explanation */}
            <div className="pt-2">
              <Button size="sm" variant="outline" onClick={generateExplanation} disabled={aiLoading} className="text-xs">
                {aiLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                Explain Anomalies with AI
              </Button>
              {aiExplanation && (
                <div className="mt-3 p-3 rounded-lg bg-accent/5 border border-accent/20">
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{aiExplanation}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No anomalies detected in the current dataset. Revenue patterns are within normal range.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default AnomalyDetectionPanel;
