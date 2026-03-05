import { Button } from "@/components/ui/button";
import { Presentation, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface ExportPptxButtonProps {
  filename?: string;
  data: {
    title: string;
    subtitle?: string;
    kpis: { label: string; value: string }[];
    breakdownTitle?: string;
    breakdown?: { name: string; value: string; percentage?: string }[];
    findings?: string[];
    campaignTable?: {
      name: string;
      spend: string;
      revenue: string;
      roas: string;
    }[];
  };
}

// SignalStack brand palette
const BRAND = {
  gold: "C5A572",
  dark: "1A1A1A",
  gray: "6B7280",
  lightGray: "F3F4F6",
  white: "FFFFFF",
  tableHeader: "1F2937",
  tableStripe: "F9FAFB",
} as const;

const ExportPptxButton = ({
  filename = "Report",
  data,
}: ExportPptxButtonProps) => {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    toast.info("Generating presentation...");

    try {
      const PptxGenJS = (await import("pptxgenjs")).default;
      const pres = new PptxGenJS();

      pres.layout = "LAYOUT_WIDE";
      pres.author = "SignalStack by Pot Labs";
      pres.company = "Pot Strategy (Pty) Ltd";
      pres.title = data.title;

      // ── Slide 1: Title ──
      buildTitleSlide(pres, data);

      // ── Slide 2: KPI Summary ──
      if (data.kpis.length > 0) {
        buildKpiSlide(pres, data.kpis);
      }

      // ── Slide 3: Breakdown Table ──
      if (data.breakdown && data.breakdown.length > 0) {
        buildBreakdownSlide(
          pres,
          data.breakdownTitle ?? "Breakdown",
          data.breakdown
        );
      }

      // ── Slide 4: Campaign Table ──
      if (data.campaignTable && data.campaignTable.length > 0) {
        buildCampaignSlide(pres, data.campaignTable);
      }

      // ── Slide 5: Key Findings ──
      if (data.findings && data.findings.length > 0) {
        buildFindingsSlide(pres, data.findings);
      }

      // ── Slide 6: Closing ──
      buildClosingSlide(pres);

      const date = new Date().toISOString().slice(0, 10);
      await pres.writeFile({
        fileName: `SignalStack-${filename}-${date}.pptx`,
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
      disabled={exporting || !data.kpis.length}
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

// ── Slide builders ──

type Pres = InstanceType<
  Awaited<ReturnType<typeof import("pptxgenjs")>>["default"]
>;

function addFooter(
  slide: ReturnType<Pres["addSlide"]>,
  text: string = "signalstack.africa"
) {
  slide.addText(text, {
    x: 0.5,
    y: 5.15,
    w: "90%",
    h: 0.25,
    fontSize: 8,
    color: BRAND.gray,
    fontFace: "Arial",
  });
}

function buildTitleSlide(pres: Pres, data: ExportPptxButtonProps["data"]) {
  const slide = pres.addSlide();

  // Gold accent bar at top
  slide.addShape("rect" as unknown as Parameters<typeof slide.addShape>[0], {
    x: 0,
    y: 0,
    w: "100%",
    h: 0.06,
    fill: { color: BRAND.gold },
  });

  // SignalStack label
  slide.addText("SignalStack", {
    x: 0.8,
    y: 1.2,
    w: 8,
    h: 0.5,
    fontSize: 14,
    fontFace: "Arial",
    color: BRAND.gold,
    bold: true,
    letterSpacing: 3,
  });

  // Main title
  slide.addText(data.title, {
    x: 0.8,
    y: 1.8,
    w: 10,
    h: 0.8,
    fontSize: 32,
    fontFace: "Arial",
    color: BRAND.dark,
    bold: true,
  });

  // Subtitle / date range
  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: 0.8,
      y: 2.6,
      w: 10,
      h: 0.5,
      fontSize: 16,
      fontFace: "Arial",
      color: BRAND.gray,
    });
  }

  // Tagline
  slide.addText("Commerce Intelligence Harmoniser by Pot Labs", {
    x: 0.8,
    y: 3.4,
    w: 10,
    h: 0.35,
    fontSize: 11,
    fontFace: "Arial",
    color: BRAND.gray,
    italic: true,
  });

  // Date generated
  const today = new Date().toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  slide.addText(`Generated: ${today}`, {
    x: 0.8,
    y: 4.0,
    w: 6,
    h: 0.3,
    fontSize: 10,
    fontFace: "Arial",
    color: BRAND.gray,
  });

  // Bottom gold bar
  slide.addShape("rect" as unknown as Parameters<typeof slide.addShape>[0], {
    x: 0,
    y: 5.37,
    w: "100%",
    h: 0.13,
    fill: { color: BRAND.gold },
  });
}

function buildKpiSlide(
  pres: Pres,
  kpis: ExportPptxButtonProps["data"]["kpis"]
) {
  const slide = pres.addSlide();

  // Header
  slide.addText("Key Performance Indicators", {
    x: 0.5,
    y: 0.3,
    w: 10,
    h: 0.5,
    fontSize: 22,
    fontFace: "Arial",
    color: BRAND.dark,
    bold: true,
  });

  // Gold underline
  slide.addShape("rect" as unknown as Parameters<typeof slide.addShape>[0], {
    x: 0.5,
    y: 0.82,
    w: 2.0,
    h: 0.04,
    fill: { color: BRAND.gold },
  });

  // KPI grid — up to 6 boxes in a 3x2 layout
  const cols = 3;
  const boxW = 3.5;
  const boxH = 1.5;
  const gapX = 0.35;
  const gapY = 0.3;
  const startX = 0.5;
  const startY = 1.2;

  kpis.slice(0, 6).forEach((kpi, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (boxW + gapX);
    const y = startY + row * (boxH + gapY);

    // Box background
    slide.addShape("rect" as unknown as Parameters<typeof slide.addShape>[0], {
      x,
      y,
      w: boxW,
      h: boxH,
      fill: { color: BRAND.lightGray },
      rectRadius: 0.1,
    });

    // Gold left accent
    slide.addShape("rect" as unknown as Parameters<typeof slide.addShape>[0], {
      x,
      y,
      w: 0.06,
      h: boxH,
      fill: { color: BRAND.gold },
      rectRadius: 0.03,
    });

    // Label
    slide.addText(kpi.label, {
      x: x + 0.25,
      y: y + 0.25,
      w: boxW - 0.4,
      h: 0.35,
      fontSize: 11,
      fontFace: "Arial",
      color: BRAND.gray,
    });

    // Value
    slide.addText(kpi.value, {
      x: x + 0.25,
      y: y + 0.65,
      w: boxW - 0.4,
      h: 0.55,
      fontSize: 26,
      fontFace: "Arial",
      color: BRAND.dark,
      bold: true,
    });
  });

  addFooter(slide);
}

function buildBreakdownSlide(
  pres: Pres,
  title: string,
  breakdown: NonNullable<ExportPptxButtonProps["data"]["breakdown"]>
) {
  const slide = pres.addSlide();

  slide.addText(title, {
    x: 0.5,
    y: 0.3,
    w: 10,
    h: 0.5,
    fontSize: 22,
    fontFace: "Arial",
    color: BRAND.dark,
    bold: true,
  });

  slide.addShape("rect" as unknown as Parameters<typeof slide.addShape>[0], {
    x: 0.5,
    y: 0.82,
    w: 2.0,
    h: 0.04,
    fill: { color: BRAND.gold },
  });

  const hasPercentage = breakdown.some((b) => b.percentage);
  const headerRow = hasPercentage
    ? [
        { text: "Name", options: { bold: true, color: BRAND.white, fill: { color: BRAND.tableHeader } } },
        { text: "Value", options: { bold: true, color: BRAND.white, fill: { color: BRAND.tableHeader }, align: "right" as const } },
        { text: "%", options: { bold: true, color: BRAND.white, fill: { color: BRAND.tableHeader }, align: "right" as const } },
      ]
    : [
        { text: "Name", options: { bold: true, color: BRAND.white, fill: { color: BRAND.tableHeader } } },
        { text: "Value", options: { bold: true, color: BRAND.white, fill: { color: BRAND.tableHeader }, align: "right" as const } },
      ];

  const dataRows = breakdown.slice(0, 12).map((row, i) => {
    const stripeFill = i % 2 === 1 ? { fill: { color: BRAND.tableStripe } } : {};
    const cells = [
      { text: row.name, options: { color: BRAND.dark, ...stripeFill } },
      { text: row.value, options: { color: BRAND.dark, align: "right" as const, ...stripeFill } },
    ];
    if (hasPercentage) {
      cells.push({
        text: row.percentage ?? "",
        options: { color: BRAND.gray, align: "right" as const, ...stripeFill },
      });
    }
    return cells;
  });

  const colW = hasPercentage ? [4.5, 3, 2] : [5.5, 4];

  slide.addTable([headerRow, ...dataRows], {
    x: 0.5,
    y: 1.1,
    w: hasPercentage ? 9.5 : 9.5,
    colW,
    fontSize: 12,
    fontFace: "Arial",
    border: { type: "solid", pt: 0.5, color: "E5E7EB" },
    rowH: 0.4,
  });

  addFooter(slide);
}

function buildCampaignSlide(
  pres: Pres,
  campaignTable: NonNullable<ExportPptxButtonProps["data"]["campaignTable"]>
) {
  const slide = pres.addSlide();

  slide.addText("Campaign Performance", {
    x: 0.5,
    y: 0.3,
    w: 10,
    h: 0.5,
    fontSize: 22,
    fontFace: "Arial",
    color: BRAND.dark,
    bold: true,
  });

  slide.addShape("rect" as unknown as Parameters<typeof slide.addShape>[0], {
    x: 0.5,
    y: 0.82,
    w: 2.0,
    h: 0.04,
    fill: { color: BRAND.gold },
  });

  const headerRow = [
    { text: "Campaign", options: { bold: true, color: BRAND.white, fill: { color: BRAND.tableHeader } } },
    { text: "Spend", options: { bold: true, color: BRAND.white, fill: { color: BRAND.tableHeader }, align: "right" as const } },
    { text: "Revenue", options: { bold: true, color: BRAND.white, fill: { color: BRAND.tableHeader }, align: "right" as const } },
    { text: "ROAS", options: { bold: true, color: BRAND.white, fill: { color: BRAND.tableHeader }, align: "right" as const } },
  ];

  const dataRows = campaignTable.slice(0, 10).map((row, i) => {
    const stripeFill = i % 2 === 1 ? { fill: { color: BRAND.tableStripe } } : {};
    return [
      { text: row.name, options: { color: BRAND.dark, ...stripeFill } },
      { text: row.spend, options: { color: BRAND.dark, align: "right" as const, ...stripeFill } },
      { text: row.revenue, options: { color: BRAND.dark, align: "right" as const, ...stripeFill } },
      { text: row.roas, options: { color: BRAND.dark, align: "right" as const, bold: true, ...stripeFill } },
    ];
  });

  slide.addTable([headerRow, ...dataRows], {
    x: 0.5,
    y: 1.1,
    w: 12,
    colW: [5, 2.5, 2.5, 2],
    fontSize: 12,
    fontFace: "Arial",
    border: { type: "solid", pt: 0.5, color: "E5E7EB" },
    rowH: 0.4,
  });

  addFooter(slide);
}

function buildFindingsSlide(pres: Pres, findings: string[]) {
  const slide = pres.addSlide();

  slide.addText("Key Findings", {
    x: 0.5,
    y: 0.3,
    w: 10,
    h: 0.5,
    fontSize: 22,
    fontFace: "Arial",
    color: BRAND.dark,
    bold: true,
  });

  slide.addShape("rect" as unknown as Parameters<typeof slide.addShape>[0], {
    x: 0.5,
    y: 0.82,
    w: 2.0,
    h: 0.04,
    fill: { color: BRAND.gold },
  });

  const bulletItems = findings.slice(0, 8).map((finding) => ({
    text: finding,
    options: {
      fontSize: 14,
      fontFace: "Arial",
      color: BRAND.dark,
      bullet: { code: "2022" },
      paraSpaceAfter: 10,
      lineSpacingMultiple: 1.3,
    },
  }));

  slide.addText(bulletItems, {
    x: 0.7,
    y: 1.2,
    w: 11,
    h: 3.8,
    valign: "top",
  });

  addFooter(slide);
}

function buildClosingSlide(pres: Pres) {
  const slide = pres.addSlide();

  // Gold accent bar at top
  slide.addShape("rect" as unknown as Parameters<typeof slide.addShape>[0], {
    x: 0,
    y: 0,
    w: "100%",
    h: 0.06,
    fill: { color: BRAND.gold },
  });

  slide.addText("SignalStack", {
    x: 0,
    y: 1.8,
    w: "100%",
    h: 0.6,
    fontSize: 28,
    fontFace: "Arial",
    color: BRAND.gold,
    bold: true,
    align: "center",
    letterSpacing: 3,
  });

  slide.addText("Commerce Intelligence Harmoniser", {
    x: 0,
    y: 2.4,
    w: "100%",
    h: 0.4,
    fontSize: 14,
    fontFace: "Arial",
    color: BRAND.gray,
    align: "center",
  });

  slide.addText("signalstack.africa", {
    x: 0,
    y: 3.2,
    w: "100%",
    h: 0.4,
    fontSize: 12,
    fontFace: "Arial",
    color: BRAND.gold,
    align: "center",
    bold: true,
  });

  const today = new Date().toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  slide.addText(`Generated by SignalStack on ${today}`, {
    x: 0,
    y: 4.2,
    w: "100%",
    h: 0.3,
    fontSize: 9,
    fontFace: "Arial",
    color: BRAND.gray,
    align: "center",
  });

  // Bottom gold bar
  slide.addShape("rect" as unknown as Parameters<typeof slide.addShape>[0], {
    x: 0,
    y: 5.37,
    w: "100%",
    h: 0.13,
    fill: { color: BRAND.gold },
  });
}

export default ExportPptxButton;
