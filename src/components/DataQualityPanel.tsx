import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, AlertTriangle, XCircle, Shield } from "lucide-react";
import { scoreSellOutQuality, scoreCampaignQuality, type DataQualityReport, type DataQualityIssue } from "@/lib/data-quality-utils";

interface DataQualityPanelProps {
  sellOutData: Record<string, unknown>[];
  campaignData: Record<string, unknown>[];
}

const scoreColor = (score: number) => {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
};

const scoreLabel = (score: number) => {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 40) return "Poor";
  return "Critical";
};

const progressColor = (score: number) => {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
};

const severityIcon = (severity: DataQualityIssue["severity"]) => {
  switch (severity) {
    case "critical": return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
    case "warning": return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
    case "info": return <CheckCircle className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
  }
};

const ScoreRing = ({ score, label }: { score: number; label: string }) => (
  <div className="flex flex-col items-center gap-1.5">
    <div className="relative h-16 w-16">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
        <circle
          cx="18" cy="18" r="15.5" fill="none"
          stroke={score >= 80 ? "hsl(142, 71%, 45%)" : score >= 60 ? "hsl(45, 93%, 47%)" : "hsl(0, 84%, 60%)"}
          strokeWidth="3"
          strokeDasharray={`${(score / 100) * 97.4} 97.4`}
          strokeLinecap="round"
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${scoreColor(score)}`}>
        {score}
      </span>
    </div>
    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{label}</span>
  </div>
);

const DataQualityPanel = ({ sellOutData, campaignData }: DataQualityPanelProps) => {
  const sellOutReport = useMemo(() => scoreSellOutQuality(sellOutData), [sellOutData]);
  const campaignReport = useMemo(() => scoreCampaignQuality(campaignData), [campaignData]);

  const combinedScore = sellOutData.length > 0 && campaignData.length > 0
    ? Math.round((sellOutReport.overallScore + campaignReport.overallScore) / 2)
    : sellOutData.length > 0 ? sellOutReport.overallScore : campaignReport.overallScore;

  const allIssues = [
    ...sellOutReport.issues.map((i) => ({ ...i, source: "Sell-Out" as const })),
    ...campaignReport.issues.map((i) => ({ ...i, source: "Campaign" as const })),
  ].sort((a, b) => {
    const ord: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    return ord[a.severity] - ord[b.severity];
  });

  if (sellOutData.length === 0 && campaignData.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Data Quality Score
          </CardTitle>
          <Badge variant="outline" className={`text-xs font-semibold ${scoreColor(combinedScore)}`}>
            {scoreLabel(combinedScore)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Score rings */}
        <div className="flex justify-center gap-8">
          <ScoreRing score={combinedScore} label="Overall" />
          {sellOutData.length > 0 && (
            <>
              <ScoreRing score={sellOutReport.completenessScore} label="Complete" />
              <ScoreRing score={sellOutReport.consistencyScore} label="Consistent" />
              <ScoreRing score={sellOutReport.freshnessScore} label="Fresh" />
            </>
          )}
        </div>

        {/* Dataset summaries */}
        <div className="grid sm:grid-cols-2 gap-3">
          {sellOutData.length > 0 && (
            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold">Sell-Out Data</span>
                <span className={`text-xs font-bold ${scoreColor(sellOutReport.overallScore)}`}>{sellOutReport.overallScore}/100</span>
              </div>
              <p className="text-[10px] text-muted-foreground mb-2">{sellOutReport.totalRows.toLocaleString()} rows</p>
              {sellOutReport.fieldScores.slice(0, 5).map((fs) => (
                <div key={fs.field} className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-muted-foreground w-20 truncate">{fs.field}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${progressColor(fs.completeness)}`} style={{ width: `${fs.completeness}%` }} />
                  </div>
                  <span className="text-[10px] tabular-nums w-8 text-right">{fs.completeness.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
          {campaignData.length > 0 && (
            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold">Campaign Data</span>
                <span className={`text-xs font-bold ${scoreColor(campaignReport.overallScore)}`}>{campaignReport.overallScore}/100</span>
              </div>
              <p className="text-[10px] text-muted-foreground mb-2">{campaignReport.totalRows.toLocaleString()} rows</p>
              {campaignReport.fieldScores.slice(0, 5).map((fs) => (
                <div key={fs.field} className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-muted-foreground w-20 truncate">{fs.field}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${progressColor(fs.completeness)}`} style={{ width: `${fs.completeness}%` }} />
                  </div>
                  <span className="text-[10px] tabular-nums w-8 text-right">{fs.completeness.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Issues */}
        {allIssues.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold mb-2">Issues ({allIssues.length})</h4>
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {allIssues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {severityIcon(issue.severity)}
                  <span className="text-muted-foreground">
                    <Badge variant="outline" className="text-[9px] mr-1">{issue.source}</Badge>
                    {issue.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DataQualityPanel;
