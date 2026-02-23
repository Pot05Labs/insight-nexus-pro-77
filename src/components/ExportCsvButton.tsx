import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportToCsv } from "@/lib/csv-export";

interface ExportCsvButtonProps {
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}

const ExportCsvButton = ({ filename, headers, rows }: ExportCsvButtonProps) => {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => exportToCsv(filename, headers, rows)}
      disabled={rows.length === 0}
    >
      <Download className="h-3.5 w-3.5 mr-1.5" />
      CSV
    </Button>
  );
};

export default ExportCsvButton;
