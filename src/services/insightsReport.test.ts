import { describe, expect, it } from "vitest";
import { isNoDataReport, selectLatestStrategicReport, type NarrativeReportRow } from "@/services/insightsReport";

describe("insightsReport helpers", () => {
  it("detects stale no-data reports", () => {
    expect(
      isNoDataReport({
        executive_summary: "No data available. Please upload sell-out or campaign data first.",
      }),
    ).toBe(true);
  });

  it("selects the latest valid strategic report for the active project", () => {
    const rows: NarrativeReportRow[] = [
      {
        project_id: "project-b",
        report_type: "strategic_insights",
        deleted_at: null,
        created_at: "2026-03-06T10:00:00Z",
        content: { executive_summary: "Wrong project" },
      },
      {
        project_id: "project-a",
        report_type: "strategic_insights",
        deleted_at: null,
        created_at: "2026-03-06T11:00:00Z",
        content: { executive_summary: "No data available. Please upload sell-out or campaign data first." },
      },
      {
        project_id: "project-a",
        report_type: "strategic_insights",
        deleted_at: null,
        created_at: "2026-03-06T09:00:00Z",
        content: { executive_summary: "Healthy executive summary" },
      },
    ];

    expect(selectLatestStrategicReport(rows, "project-a")?.executive_summary).toBe("Healthy executive summary");
  });
});
