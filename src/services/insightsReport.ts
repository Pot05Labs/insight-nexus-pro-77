export type ReportContent = {
  executive_summary?: string;
  insights?: { title: string; insight: string; data_point: string; implication: string }[];
  recommendations?: { title: string; description: string }[];
};

export type NarrativeReportRow = {
  content: unknown;
  created_at: string | null;
  deleted_at: string | null;
  project_id: string;
  report_type: string | null;
};

const NO_DATA_MARKERS = [
  "no data available",
  "upload sell-out",
  "upload sell out",
  "upload campaign data first",
  "don't have data loaded",
  "do not have data loaded",
];

export function parseStoredReport(content: unknown): ReportContent | null {
  if (!content || typeof content !== "object") return null;

  const candidate = content as ReportContent;
  const hasSummary = typeof candidate.executive_summary === "string";
  const hasInsights = Array.isArray(candidate.insights);
  const hasRecommendations = Array.isArray(candidate.recommendations);

  if (!hasSummary && !hasInsights && !hasRecommendations) return null;
  return candidate;
}

export function isNoDataReport(content: unknown): boolean {
  if (typeof content === "string") {
    const norm = content.toLowerCase();
    return NO_DATA_MARKERS.some((marker) => norm.includes(marker));
  }

  const parsed = parseStoredReport(content);
  if (!parsed) return false;

  const fields = [
    parsed.executive_summary ?? "",
    ...(parsed.insights ?? []).flatMap((insight) => [
      insight.title,
      insight.insight,
      insight.data_point,
      insight.implication,
    ]),
    ...(parsed.recommendations ?? []).flatMap((rec) => [rec.title, rec.description]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return NO_DATA_MARKERS.some((marker) => fields.includes(marker));
}

export function selectLatestStrategicReport(
  reports: NarrativeReportRow[],
  projectId: string,
): ReportContent | null {
  const candidates = reports
    .filter(
      (report) =>
        report.project_id === projectId &&
        report.deleted_at === null &&
        report.report_type === "strategic_insights",
    )
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  for (const candidate of candidates) {
    if (isNoDataReport(candidate.content)) continue;
    const parsed = parseStoredReport(candidate.content);
    if (parsed) return parsed;
  }

  return null;
}
