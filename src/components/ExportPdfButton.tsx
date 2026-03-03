import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface ExportPdfButtonProps {
  targetRef: React.RefObject<HTMLDivElement>;
  filename?: string;
}

const ExportPdfButton = ({ targetRef, filename = "report" }: ExportPdfButtonProps) => {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    const el = targetRef.current;
    if (!el) return;

    setExporting(true);
    toast.info("Generating PDF...");

    try {
      // Dynamically import to keep initial bundle small
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      // Capture the element as a high-res canvas
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;

      // A4 dimensions in mm
      const pdfWidth = 210;
      const pdfHeight = 297;
      const margin = 10;
      const contentWidth = pdfWidth - margin * 2;

      // Scale image to fit page width
      const ratio = contentWidth / imgWidth;
      const scaledHeight = imgHeight * ratio;

      // Create PDF — portrait A4
      const pdf = new jsPDF("p", "mm", "a4");

      // If content fits on one page, center it; otherwise paginate
      if (scaledHeight <= pdfHeight - margin * 2) {
        pdf.addImage(imgData, "PNG", margin, margin, contentWidth, scaledHeight);
      } else {
        // Multi-page: slice the canvas into page-sized chunks
        const pageContentHeight = pdfHeight - margin * 2;
        const sourcePageHeight = pageContentHeight / ratio;
        let yOffset = 0;
        let page = 0;

        while (yOffset < imgHeight) {
          if (page > 0) pdf.addPage();

          // Create a page-sized canvas slice
          const sliceHeight = Math.min(sourcePageHeight, imgHeight - yOffset);
          const pageCanvas = document.createElement("canvas");
          pageCanvas.width = imgWidth;
          pageCanvas.height = sliceHeight;
          const ctx = pageCanvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(canvas, 0, -yOffset);
            const pageImg = pageCanvas.toDataURL("image/png");
            const sliceScaledHeight = sliceHeight * ratio;
            pdf.addImage(pageImg, "PNG", margin, margin, contentWidth, sliceScaledHeight);
          }

          yOffset += sourcePageHeight;
          page++;
        }
      }

      // Trigger automatic download
      const date = new Date().toISOString().slice(0, 10);
      pdf.save(`SignalStack-${filename}-${date}.pdf`);
      toast.success("PDF downloaded");
    } catch (err: any) {
      console.error("PDF export failed:", err);
      toast.error("PDF export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
      {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileDown className="h-4 w-4 mr-2" />}
      Export PDF
    </Button>
  );
};

export default ExportPdfButton;
