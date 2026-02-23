/**
 * Data Quality Scoring utilities for Level 2.
 * Scores datasets on completeness, consistency, and freshness.
 */

export interface FieldScore {
  field: string;
  total: number;
  filled: number;
  completeness: number;
}

export interface DataQualityReport {
  /** Overall quality score 0-100 */
  overallScore: number;
  /** Completeness score 0-100 (percentage of non-null fields) */
  completenessScore: number;
  /** Consistency score 0-100 (data format validity) */
  consistencyScore: number;
  /** Freshness score 0-100 (how recent the data is) */
  freshnessScore: number;
  /** Total rows analyzed */
  totalRows: number;
  /** Per-field completeness breakdown */
  fieldScores: FieldScore[];
  /** Issues found */
  issues: DataQualityIssue[];
}

export interface DataQualityIssue {
  severity: "critical" | "warning" | "info";
  field: string;
  description: string;
}

/**
 * Score sell-out data quality.
 */
export function scoreSellOutQuality(
  data: Record<string, unknown>[],
): DataQualityReport {
  if (data.length === 0) {
    return {
      overallScore: 0,
      completenessScore: 0,
      consistencyScore: 0,
      freshnessScore: 0,
      totalRows: 0,
      fieldScores: [],
      issues: [{ severity: "critical", field: "dataset", description: "No data available for quality assessment" }],
    };
  }

  const criticalFields = ["date", "revenue", "units_sold", "product_name_raw", "retailer"];
  const importantFields = ["brand", "category", "region", "sku"];
  const allFields = [...criticalFields, ...importantFields];

  // Completeness
  const fieldScores: FieldScore[] = allFields.map((field) => {
    const filled = data.filter((r) => r[field] !== null && r[field] !== undefined && r[field] !== "").length;
    return {
      field,
      total: data.length,
      filled,
      completeness: (filled / data.length) * 100,
    };
  });

  const criticalCompleteness = fieldScores
    .filter((f) => criticalFields.includes(f.field))
    .reduce((s, f) => s + f.completeness, 0) / criticalFields.length;

  const overallCompleteness = fieldScores.reduce((s, f) => s + f.completeness, 0) / allFields.length;

  // Consistency checks
  const issues: DataQualityIssue[] = [];
  let consistencyDeductions = 0;

  // Check date format consistency
  const dateValues = data.map((r) => r.date as string).filter(Boolean);
  const invalidDates = dateValues.filter((d) => isNaN(new Date(d).getTime()));
  if (invalidDates.length > 0) {
    const pct = (invalidDates.length / dateValues.length) * 100;
    issues.push({
      severity: pct > 10 ? "critical" : "warning",
      field: "date",
      description: `${invalidDates.length} rows (${pct.toFixed(1)}%) have invalid date formats`,
    });
    consistencyDeductions += Math.min(pct, 30);
  }

  // Check revenue is numeric and positive
  const revenueValues = data.map((r) => Number(r.revenue)).filter((v) => !isNaN(v));
  const negativeRevenue = revenueValues.filter((v) => v < 0);
  if (negativeRevenue.length > 0) {
    issues.push({
      severity: "warning",
      field: "revenue",
      description: `${negativeRevenue.length} rows have negative revenue values`,
    });
    consistencyDeductions += 10;
  }

  // Check for duplicate-looking rows
  const rowKeys = new Set<string>();
  let dupeCount = 0;
  for (const r of data) {
    const key = `${r.date}|${r.product_name_raw}|${r.retailer}|${r.revenue}`;
    if (rowKeys.has(key)) dupeCount++;
    else rowKeys.add(key);
  }
  if (dupeCount > 0) {
    const pct = (dupeCount / data.length) * 100;
    issues.push({
      severity: pct > 5 ? "warning" : "info",
      field: "dataset",
      description: `${dupeCount} potential duplicate rows detected (${pct.toFixed(1)}%)`,
    });
    consistencyDeductions += Math.min(pct, 20);
  }

  // Completeness issues
  for (const fs of fieldScores) {
    if (fs.completeness < 50 && criticalFields.includes(fs.field)) {
      issues.push({
        severity: "critical",
        field: fs.field,
        description: `${fs.field} is only ${fs.completeness.toFixed(0)}% complete (${fs.filled}/${fs.total} rows)`,
      });
    } else if (fs.completeness < 80 && criticalFields.includes(fs.field)) {
      issues.push({
        severity: "warning",
        field: fs.field,
        description: `${fs.field} is ${fs.completeness.toFixed(0)}% complete — ${fs.total - fs.filled} missing values`,
      });
    } else if (fs.completeness < 50 && importantFields.includes(fs.field)) {
      issues.push({
        severity: "info",
        field: fs.field,
        description: `${fs.field} is only ${fs.completeness.toFixed(0)}% complete`,
      });
    }
  }

  const consistencyScore = Math.max(0, 100 - consistencyDeductions);

  // Freshness
  const dates = dateValues.map((d) => new Date(d).getTime()).filter((t) => !isNaN(t));
  let freshnessScore = 0;
  if (dates.length > 0) {
    const latestDate = new Date(Math.max(...dates));
    const now = new Date();
    const daysSinceLatest = (now.getTime() - latestDate.getTime()) / 86400000;

    if (daysSinceLatest <= 1) freshnessScore = 100;
    else if (daysSinceLatest <= 7) freshnessScore = 90;
    else if (daysSinceLatest <= 30) freshnessScore = 70;
    else if (daysSinceLatest <= 90) freshnessScore = 50;
    else if (daysSinceLatest <= 365) freshnessScore = 30;
    else freshnessScore = 10;

    if (daysSinceLatest > 30) {
      issues.push({
        severity: daysSinceLatest > 90 ? "critical" : "warning",
        field: "date",
        description: `Latest data is ${Math.round(daysSinceLatest)} days old`,
      });
    }
  }

  const completenessScore = Math.round((criticalCompleteness * 0.7 + overallCompleteness * 0.3));
  const overallScore = Math.round(completenessScore * 0.4 + consistencyScore * 0.35 + freshnessScore * 0.25);

  // Sort issues by severity
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    overallScore,
    completenessScore,
    consistencyScore,
    freshnessScore,
    totalRows: data.length,
    fieldScores,
    issues,
  };
}

/**
 * Score campaign data quality.
 */
export function scoreCampaignQuality(
  data: Record<string, unknown>[],
): DataQualityReport {
  if (data.length === 0) {
    return {
      overallScore: 0,
      completenessScore: 0,
      consistencyScore: 0,
      freshnessScore: 0,
      totalRows: 0,
      fieldScores: [],
      issues: [{ severity: "critical", field: "dataset", description: "No campaign data available" }],
    };
  }

  const criticalFields = ["flight_start", "spend", "campaign_name", "platform"];
  const importantFields = ["impressions", "clicks", "conversions", "revenue", "flight_end"];
  const allFields = [...criticalFields, ...importantFields];

  const fieldScores: FieldScore[] = allFields.map((field) => {
    const filled = data.filter((r) => r[field] !== null && r[field] !== undefined && r[field] !== "").length;
    return { field, total: data.length, filled, completeness: (filled / data.length) * 100 };
  });

  const criticalCompleteness = fieldScores
    .filter((f) => criticalFields.includes(f.field))
    .reduce((s, f) => s + f.completeness, 0) / criticalFields.length;

  const overallCompleteness = fieldScores.reduce((s, f) => s + f.completeness, 0) / allFields.length;

  const issues: DataQualityIssue[] = [];
  let consistencyDeductions = 0;

  // Check for zero-spend campaigns
  const zeroSpend = data.filter((r) => Number(r.spend) === 0 || r.spend === null);
  if (zeroSpend.length > 0) {
    issues.push({
      severity: "warning",
      field: "spend",
      description: `${zeroSpend.length} campaigns have zero or missing spend`,
    });
    consistencyDeductions += 5;
  }

  // Field completeness issues
  for (const fs of fieldScores) {
    if (fs.completeness < 50 && criticalFields.includes(fs.field)) {
      issues.push({ severity: "critical", field: fs.field, description: `${fs.field} is only ${fs.completeness.toFixed(0)}% complete` });
    } else if (fs.completeness < 80 && criticalFields.includes(fs.field)) {
      issues.push({ severity: "warning", field: fs.field, description: `${fs.field} is ${fs.completeness.toFixed(0)}% complete` });
    }
  }

  const consistencyScore = Math.max(0, 100 - consistencyDeductions);

  const dateValues = data.map((r) => r.flight_start as string).filter(Boolean);
  const dates = dateValues.map((d) => new Date(d).getTime()).filter((t) => !isNaN(t));
  let freshnessScore = 0;
  if (dates.length > 0) {
    const latest = new Date(Math.max(...dates));
    const daysSince = (Date.now() - latest.getTime()) / 86400000;
    if (daysSince <= 7) freshnessScore = 100;
    else if (daysSince <= 30) freshnessScore = 80;
    else if (daysSince <= 90) freshnessScore = 50;
    else freshnessScore = 20;
  }

  const completenessScore = Math.round(criticalCompleteness * 0.7 + overallCompleteness * 0.3);
  const overallScore = Math.round(completenessScore * 0.4 + consistencyScore * 0.35 + freshnessScore * 0.25);

  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return { overallScore, completenessScore, consistencyScore, freshnessScore, totalRows: data.length, fieldScores, issues };
}
