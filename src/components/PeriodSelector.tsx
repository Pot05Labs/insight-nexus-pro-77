import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays } from "lucide-react";
import type { PeriodMode } from "@/lib/period-utils";

interface PeriodSelectorProps {
  value: PeriodMode;
  onChange: (mode: PeriodMode) => void;
}

const options: { value: PeriodMode; label: string; description: string }[] = [
  { value: "WoW", label: "Week-over-Week", description: "Compare this week vs last week" },
  { value: "MoM", label: "Month-over-Month", description: "Compare this month vs last month" },
  { value: "QoQ", label: "Quarter-over-Quarter", description: "Compare this quarter vs last" },
  { value: "YoY", label: "Year-over-Year", description: "Compare this year vs last year" },
];

const PeriodSelector = ({ value, onChange }: PeriodSelectorProps) => (
  <Select value={value} onValueChange={(v) => onChange(v as PeriodMode)}>
    <SelectTrigger className="w-[180px] h-9">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
        <SelectValue />
      </div>
    </SelectTrigger>
    <SelectContent>
      {options.map((opt) => (
        <SelectItem key={opt.value} value={opt.value}>
          <div>
            <p className="text-sm font-medium">{opt.label}</p>
            <p className="text-[10px] text-muted-foreground">{opt.description}</p>
          </div>
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export default PeriodSelector;
