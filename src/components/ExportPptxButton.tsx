/* ------------------------------------------------------------------ */
/*  ExportPptxButton — Branded PPTX export for SignalStack reports    */
/*                                                                     */
/*  Generates a professional PowerPoint presentation with:            */
/*  • Organisation branding (logo, colors, tagline)                   */
/*  • "Powered by SignalStack" footer on every slide                  */
/*  • Executive summary, insights, recommendations, campaign table    */
/*  • Confidential watermark (optional per brand config)              */
/*                                                                     */
/*  Brand config flows from OrgContext → InsightsPage → this button.  */
/*  Default: Pot Strategy branding. Fallback: SignalStack generic.    */
/* ------------------------------------------------------------------ */

import { Button } from "@/components/ui/button";
import { Presentation, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { ReportContent } from "@/services/insightsReport";
import {
  type ReportBrandConfig,
  POT_STRATEGY_BRAND,
  SIGNALSTACK_BADGE_SVG,
  svgToPngDataUri,
} from "@/lib/report-brand-config";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface ExportPptxButtonProps {
  filename?: string;
  /** The AI-generated report content */
  report: ReportContent | null;
  /** Brand configuration — defaults to Pot Strategy */
  brand?: ReportBrandConfig;
  /** Optional campaign performance table */
  campaignTable?: {
    name: string;
    spend: string;
    revenue: string;
    roas: string;
  }[];
}

/* ------------------------------------------------------------------ */
/*  Logo cache — avoid re-rendering SVG→PNG on every export            */
/* ------------------------------------------------------------------ */

const logoCache = new Map<string, string>();

async function getLogoPng(
  brand: ReportBrandConfig,
): Promise<string | null> {
  // Priority: base64 > SVG > null
  if (brand.logoBase64) return brand.logoBase64;
  if (!brand.logoSvg) return null;

  const cacheKey = brand.orgName;
  if (logoCache.has(cacheKey)) return logoCache.get(cacheKey)!;

  const dpi = 96;
  const png = await svgToPngDataUri(
    brand.logoSvg,
    Math.round(brand.logoWidth * dpi),
    Math.round(brand.logoHeight * dpi),
    2,
  );
  logoCache.set(cacheKey, png);
  return png;
}

async function getBadgePng(): Promise<string> {
  if (logoCache.has("__signalstack_badge__")) {
    return logoCache.get("__signalstack_badge__")!;
  }
  const png = await svgToPngDataUri(SIGNALSTACK_BADGE_SVG, 240, 40, 2);
  logoCache.set("__signalstack_badge__", png);
  return png;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const ExportPptxButton = ({
  filename = "Report",
  report,
  brand = POT_STRATEGY_BRAND,
  campaignTable,
}: ExportPptxButtonProps) => {
  const [exporting, setExporting] = useState(false);

  const hasContent = report && (
    report.executive_summary ||
    (report.insights && report.insights.length > 0) ||
    (report.recommendations && report.recommendations.length > 0)
  );

  const handleExport = async () => {
    if (!report || !hasContent) return;
    setExporting(true);
    toast.info("Generating branded presentation...");

    try {
      const PptxGenJS = (await import("pptxgenjs")).default;
      const pres = new PptxGenJS();

      pres.layout = "LAYOUT_WIDE";
      pres.author = `${brand.orgName} via SignalStack`;
      pres.company = brand.tagline ?? brand.orgName;
      pres.title = `${brand.orgName} — AI Strategic Insights`;

      // Pre-render logos
      const logoPng = await getLogoPng(brand);
      const badgePng = await getBadgePng();

      // ── Slide 1: Cover ──
      buildCoverSlide(pres, brand, report, logoPng, badgePng);

      // ── Slide 2: Executive Summary ──
      if (report.executive_summary) {
        buildSummarySlide(pres, brand, report.executive_summary, badgePng);
      }

      // ── Slide 3+: Key Insights ──
      if (report.insights && report.insights.length > 0) {
        buildInsightSlides(pres, brand, report.insights, badgePng);
      }

      // ── Slide: Recommendations ──
      if (report.recommendations && report.recommendations.length > 0) {
        buildRecommendationsSlide(pres, brand, report.recommendations, badgePng);
      }

      // ── Slide: Campaign Performance (optional) ──
      if (campaignTable && campaignTable.length > 0) {
        buildCampaignSlide(pres, brand, campaignTable, badgePng);
      }

      // ── Final Slide: Closing ──
      buildClosingSlide(pres, brand, logoPng, badgePng);

      const date = new Date().toISOString().slice(0, 10);
      await pres.writeFile({
        fileName: `${brand.orgName.replace(/\s+/g, "-")}-${filename}-${date}.pptx`,
      });
      toast.success("Presentation downloaded");
    } catch (err) {
      console.error("PPTX export failed:", err);
      toast.error("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={exporting || !hasContent}
    >
      {exporting ? (
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
      ) : (
        <Presentation className="h-4 w-4 mr-2" />
      )}
      PPTX
    </Button>
  );
};

export default ExportPptxButton;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pres = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Slide = any;

/* ------------------------------------------------------------------ */
/*  Shared layout helpers                                              */
/* ------------------------------------------------------------------ */

/** Thin accent bar at the top of a slide */
function addTopAccent(slide: Slide, brand: ReportBrandConfig) {
  slide.addShape("rect" as Parameters<typeof slide.addShape>[0], {
    x: 0, y: 0, w: "100%", h: 0.05,
    fill: { color: brand.primaryColor },
  });
}

/** Footer with "Powered by SignalStack" badge + org URL */
function addBrandedFooter(
  slide: Slide,
  brand: ReportBrandConfig,
  badgePng: string,
) {
  // Thin divider line
  slide.addShape("rect" as Parameters<typeof slide.addShape>[0], {
    x: 0.5, y: 5.0, w: 12, h: 0.008,
    fill: { color: "E5E7EB" },
  });

  // "Powered by SignalStack" badge (left)
  slide.addImage({
    data: badgePng,
    x: 0.5, y: 5.08,
    w: 1.8, h: 0.3,
  });

  // Org URL (right)
  if (brand.url) {
    slide.addText(brand.url, {
      x: 8, y: 5.1, w: 4.5, h: 0.25,
      fontSize: 8,
      fontFace: "Arial",
      color: brand.grayColor,
      align: "right",
    });
  }
}

/** Section header with gold underline */
function addSectionHeader(
  slide: Slide,
  brand: ReportBrandConfig,
  title: string,
  y: number = 0.35,
) {
  slide.addText(title, {
    x: 0.6, y, w: 10, h: 0.5,
    fontSize: 22,
    fontFace: "Arial",
    color: brand.darkColor,
    bold: true,
  });

  slide.addShape("rect" as Parameters<typeof slide.addShape>[0], {
    x: 0.6, y: y + 0.52, w: 2.0, h: 0.04,
    fill: { color: brand.primaryColor },
  });
}

/* ------------------------------------------------------------------ */
/*  Slide 1: Cover                                                     */
/* ------------------------------------------------------------------ */

function buildCoverSlide(
  pres: Pres,
  brand: ReportBrandConfig,
  report: ReportContent,
  logoPng: string | null,
  badgePng: string,
) {
  const slide = pres.addSlide();

  // Top accent bar
  addTopAccent(slide, brand);

  // Organisation logo (or text fallback)
  if (logoPng) {
    slide.addImage({
      data: logoPng,
      x: 0.8, y: 0.5,
      w: brand.logoWidth, h: brand.logoHeight,
    });
  } else {
    // Text-based logo fallback
    slide.addText(brand.orgName.toUpperCase(), {
      x: 0.8, y: 0.5, w: 6, h: 0.5,
      fontSize: 20,
      fontFace: "Arial",
      color: brand.darkColor,
      bold: true,
      letterSpacing: 5,
    });
  }

  // Confidential badge
  if (brand.confidential) {
    slide.addText("CONFIDENTIAL", {
      x: 9, y: 0.55, w: 3.5, h: 0.35,
      fontSize: 9,
      fontFace: "Arial",
      color: brand.primaryColor,
      bold: true,
      align: "right",
      letterSpacing: 3,
    });
  }

  // Horizontal rule
  slide.addShape("rect" as Parameters<typeof slide.addShape>[0], {
    x: 0.8, y: 1.55, w: 11, h: 0.01,
    fill: { color: "E5E7EB" },
  });

  // Report title
  slide.addText("AI Strategic Insights", {
    x: 0.8, y: 1.9, w: 10, h: 0.75,
    fontSize: 34,
    fontFace: "Arial",
    color: brand.darkColor,
    bold: true,
  });

  // Subtitle — executive summary preview (first 120 chars)
  const previewText = report.executive_summary
    ? report.executive_summary.length > 140
      ? report.executive_summary.slice(0, 137) + "..."
      : report.executive_summary
    : "Commerce intelligence report generated from live analytics data.";

  slide.addText(previewText, {
    x: 0.8, y: 2.75, w: 10, h: 0.7,
    fontSize: 13,
    fontFace: "Arial",
    color: brand.grayColor,
    lineSpacingMultiple: 1.4,
  });

  // Date + org tagline
  const today = new Date().toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  slide.addText(`Generated: ${today}`, {
    x: 0.8, y: 3.7, w: 5, h: 0.3,
    fontSize: 10,
    fontFace: "Arial",
    color: brand.grayColor,
  });

  if (brand.tagline) {
    slide.addText(brand.tagline, {
      x: 0.8, y: 4.05, w: 8, h: 0.3,
      fontSize: 10,
      fontFace: "Arial",
      color: brand.grayColor,
      italic: true,
    });
  }

  // "Powered by SignalStack" badge (bottom-right)
  slide.addImage({
    data: badgePng,
    x: 9.5, y: 4.7, w: 2.2, h: 0.38,
  });

  // Bottom accent bar
  slide.addShape("rect" as Parameters<typeof slide.addShape>[0], {
    x: 0, y: 5.4, w: "100%", h: 0.1,
    fill: { color: brand.primaryColor },
  });
}

/* ------------------------------------------------------------------ */
/*  Slide 2: Executive Summary                                         */
/* ------------------------------------------------------------------ */

function buildSummarySlide(
  pres: Pres,
  brand: ReportBrandConfig,
  summary: string,
  badgePng: string,
) {
  const slide = pres.addSlide();
  addTopAccent(slide, brand);
  addSectionHeader(slide, brand, "Executive Summary");

  // Quote-style accent bar on the left
  slide.addShape("rect" as Parameters<typeof slide.addShape>[0], {
    x: 0.6, y: 1.15, w: 0.05, h: 2.5,
    fill: { color: brand.primaryColor },
    rectRadius: 0.025,
  });

  // Summary text
  slide.addText(summary, {
    x: 0.85, y: 1.15, w: 11.2, h: 2.5,
    fontSize: 15,
    fontFace: "Arial",
    color: brand.darkColor,
    lineSpacingMultiple: 1.6,
    valign: "top",
    paraSpaceAfter: 12,
  });

  addBrandedFooter(slide, brand, badgePng);
}

/* ------------------------------------------------------------------ */
/*  Slides 3+: Key Insights (max 3 per slide)                         */
/* ------------------------------------------------------------------ */

function buildInsightSlides(
  pres: Pres,
  brand: ReportBrandConfig,
  insights: NonNullable<ReportContent["insights"]>,
  badgePng: string,
) {
  // Group insights into slides of 2
  const perSlide = 2;
  const pages = [];
  for (let i = 0; i < insights.length; i += perSlide) {
    pages.push(insights.slice(i, i + perSlide));
  }

  pages.forEach((pageInsights, pageIdx) => {
    const slide = pres.addSlide();
    addTopAccent(slide, brand);

    const pageLabel = pages.length > 1
      ? `Key Insights (${pageIdx + 1}/${pages.length})`
      : "Key Insights";
    addSectionHeader(slide, brand, pageLabel);

    const cardW = 5.6;
    const cardH = 3.2;
    const gapX = 0.5;
    const startX = 0.6;
    const startY = 1.15;

    pageInsights.forEach((insight, i) => {
      const x = startX + i * (cardW + gapX);
      const y = startY;

      // Card background
      slide.addShape("rect" as Parameters<typeof slide.addShape>[0], {
        x, y, w: cardW, h: cardH,
        fill: { color: brand.lightBgColor },
        rectRadius: 0.08,
      });

      // Gold left accent
      slide.addShape("rect" as Parameters<typeof slide.addShape>[0], {
        x, y, w: 0.06, h: cardH,
        fill: { color: brand.primaryColor },
        rectRadius: 0.03,
      });

      // Insight number badge
      slide.addShape("rect" as Parameters<typeof slide.addShape>[0], {
        x: x + 0.22, y: y + 0.2, w: 0.32, h: 0.32,
        fill: { color: brand.primaryColor },
        rectRadius: 0.04,
      });
      slide.addText(String(pageIdx * perSlide + i + 1), {
        x: x + 0.22, y: y + 0.2, w: 0.32, h: 0.32,
        fontSize: 13,
        fontFace: "Arial",
        color: "FFFFFF",
        bold: true,
        align: "center",
        valign: "middle",
      });

      // Title
      slide.addText(insight.title, {
        x: x + 0.65, y: y + 0.18, w: cardW - 0.9, h: 0.38,
        fontSize: 13,
        fontFace: "Arial",
        color: brand.darkColor,
        bold: true,
        valign: "middle",
      });

      // What — insight text
      slide.addText(insight.insight, {
        x: x + 0.22, y: y + 0.65, w: cardW - 0.44, h: 0.85,
        fontSize: 10.5,
        fontFace: "Arial",
        color: brand.darkColor,
        lineSpacingMultiple: 1.4,
        valign: "top",
      });

      // Data point badge
      slide.addShape("rect" as Parameters<typeof slide.addShape>[0], {
        x: x + 0.22, y: y + 1.55, w: cardW - 0.44, h: 0.4,
        fill: { color: brand.primaryColor + "18" },
        rectRadius: 0.05,
      });
      slide.addText(insight.data_point, {
        x: x + 0.35, y: y + 1.55, w: cardW - 0.7, h: 0.4,
        fontSize: 12,
        fontFace: "Arial",
        color: brand.primaryColor,
        bold: true,
        valign: "middle",
      });

      // Implication — So What / Now What
      slide.addText("IMPLICATION", {
        x: x + 0.22, y: y + 2.08, w: cardW - 0.44, h: 0.2,
        fontSize: 7,
        fontFace: "Arial",
        color: brand.grayColor,
        bold: true,
        letterSpacing: 2,
      });
      slide.addText(insight.implication, {
        x: x + 0.22, y: y + 2.28, w: cardW - 0.44, h: 0.82,
        fontSize: 9.5,
        fontFace: "Arial",
        color: brand.grayColor,
        lineSpacingMultiple: 1.35,
        valign: "top",
      });
    });

    addBrandedFooter(slide, brand, badgePng);
  });
}

/* ------------------------------------------------------------------ */
/*  Slide: Strategic Recommendations                                   */
/* ------------------------------------------------------------------ */

function buildRecommendationsSlide(
  pres: Pres,
  brand: ReportBrandConfig,
  recommendations: NonNullable<ReportContent["recommendations"]>,
  badgePng: string,
) {
  const slide = pres.addSlide();
  addTopAccent(slide, brand);
  addSectionHeader(slide, brand, "Strategic Recommendations");

  const startY = 1.15;
  const itemH = 1.1;
  const maxItems = Math.min(recommendations.length, 4);

  recommendations.slice(0, maxItems).forEach((rec, i) => {
    const y = startY + i * itemH;

    // Number circle
    slide.addShape("rect" as Parameters<typeof slide.addShape>[0], {
      x: 0.6, y: y + 0.05, w: 0.38, h: 0.38,
      fill: { color: brand.primaryColor },
      rectRadius: 0.19,
    });
    slide.addText(String(i + 1), {
      x: 0.6, y: y + 0.05, w: 0.38, h: 0.38,
      fontSize: 14,
      fontFace: "Arial",
      color: "FFFFFF",
      bold: true,
      align: "center",
      valign: "middle",
    });

    // Title
    slide.addText(rec.title, {
      x: 1.15, y, w: 10.5, h: 0.35,
      fontSize: 14,
      fontFace: "Arial",
      color: brand.darkColor,
      bold: true,
    });

    // Description
    slide.addText(rec.description, {
      x: 1.15, y: y + 0.38, w: 10.5, h: 0.6,
      fontSize: 11,
      fontFace: "Arial",
      color: brand.grayColor,
      lineSpacingMultiple: 1.35,
      valign: "top",
    });
  });

  addBrandedFooter(slide, brand, badgePng);
}

/* ------------------------------------------------------------------ */
/*  Slide: Campaign Performance (optional)                             */
/* ------------------------------------------------------------------ */

function buildCampaignSlide(
  pres: Pres,
  brand: ReportBrandConfig,
  campaignTable: NonNullable<ExportPptxButtonProps["campaignTable"]>,
  badgePng: string,
) {
  const slide = pres.addSlide();
  addTopAccent(slide, brand);
  addSectionHeader(slide, brand, "Campaign Performance");

  const headerRow = [
    { text: "Campaign", options: { bold: true, color: "FFFFFF", fill: { color: brand.tableHeaderColor } } },
    { text: "Spend", options: { bold: true, color: "FFFFFF", fill: { color: brand.tableHeaderColor }, align: "right" as const } },
    { text: "Revenue", options: { bold: true, color: "FFFFFF", fill: { color: brand.tableHeaderColor }, align: "right" as const } },
    { text: "ROAS", options: { bold: true, color: "FFFFFF", fill: { color: brand.tableHeaderColor }, align: "right" as const } },
  ];

  const dataRows = campaignTable.slice(0, 10).map((row, i) => {
    const stripe = i % 2 === 1 ? { fill: { color: brand.tableStripeColor } } : {};
    return [
      { text: row.name, options: { color: brand.darkColor, ...stripe } },
      { text: row.spend, options: { color: brand.darkColor, align: "right" as const, ...stripe } },
      { text: row.revenue, options: { color: brand.darkColor, align: "right" as const, ...stripe } },
      { text: row.roas, options: { color: brand.primaryColor, align: "right" as const, bold: true, ...stripe } },
    ];
  });

  slide.addTable([headerRow, ...dataRows], {
    x: 0.6, y: 1.15, w: 11.5,
    colW: [5.5, 2, 2, 2],
    fontSize: 11,
    fontFace: "Arial",
    border: { type: "solid", pt: 0.5, color: "E5E7EB" },
    rowH: 0.4,
  });

  addBrandedFooter(slide, brand, badgePng);
}

/* ------------------------------------------------------------------ */
/*  Final Slide: Closing                                               */
/* ------------------------------------------------------------------ */

function buildClosingSlide(
  pres: Pres,
  brand: ReportBrandConfig,
  logoPng: string | null,
  badgePng: string,
) {
  const slide = pres.addSlide();

  // Top accent bar
  addTopAccent(slide, brand);

  // Organisation logo (centered) or text
  if (logoPng) {
    const logoX = (13.33 - brand.logoWidth) / 2;
    slide.addImage({
      data: logoPng,
      x: logoX, y: 1.4,
      w: brand.logoWidth, h: brand.logoHeight,
    });
  } else {
    slide.addText(brand.orgName.toUpperCase(), {
      x: 0, y: 1.4, w: "100%", h: 0.6,
      fontSize: 26,
      fontFace: "Arial",
      color: brand.darkColor,
      bold: true,
      align: "center",
      letterSpacing: 6,
    });
  }

  // Divider
  slide.addShape("rect" as Parameters<typeof slide.addShape>[0], {
    x: 5.5, y: 2.5, w: 2.3, h: 0.03,
    fill: { color: brand.primaryColor },
  });

  // "Powered by SignalStack" badge (centered)
  slide.addImage({
    data: badgePng,
    x: 5.55, y: 2.75,
    w: 2.2, h: 0.38,
  });

  // Tagline
  slide.addText("Commerce Intelligence Harmoniser", {
    x: 0, y: 3.3, w: "100%", h: 0.35,
    fontSize: 12,
    fontFace: "Arial",
    color: brand.grayColor,
    align: "center",
  });

  // URL
  slide.addText(brand.url ?? "signalstack.africa", {
    x: 0, y: 3.75, w: "100%", h: 0.3,
    fontSize: 11,
    fontFace: "Arial",
    color: brand.primaryColor,
    align: "center",
    bold: true,
  });

  // Date
  const today = new Date().toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  slide.addText(`Generated by SignalStack on ${today}`, {
    x: 0, y: 4.4, w: "100%", h: 0.25,
    fontSize: 9,
    fontFace: "Arial",
    color: brand.grayColor,
    align: "center",
  });

  // Bottom accent bar
  slide.addShape("rect" as Parameters<typeof slide.addShape>[0], {
    x: 0, y: 5.4, w: "100%", h: 0.1,
    fill: { color: brand.primaryColor },
  });
}
