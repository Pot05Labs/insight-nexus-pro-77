import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface ExportPdfButtonProps {
  targetRef: React.RefObject<HTMLDivElement>;
  filename?: string;
}

const ExportPdfButton = ({ targetRef, filename = "report" }: ExportPdfButtonProps) => {
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = () => {
    setExporting(true);
    // Use browser print as a reliable cross-browser PDF solution
    const printContent = targetRef.current;
    if (!printContent) {
      setExporting(false);
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({ title: "Error", description: "Please allow pop-ups to export PDF.", variant: "destructive" });
      setExporting(false);
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${filename}</title>
        <style>
          body { font-family: 'DM Sans', sans-serif; margin: 2rem; color: #1a1a2e; }
          * { box-sizing: border-box; }
          @media print {
            body { margin: 0; padding: 1rem; }
          }
        </style>
      </head>
      <body>${printContent.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
      setExporting(false);
    }, 500);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
      {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileDown className="h-4 w-4 mr-2" />}
      Export PDF
    </Button>
  );
};

export default ExportPdfButton;
