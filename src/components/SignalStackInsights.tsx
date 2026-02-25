import { useState, type ReactNode } from "react";
import { Sparkles, Loader2, Lightbulb, Copy, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { streamAiChat } from "@/services/aiChatStream";
import { toast } from "sonner";

/* ─── Types ─── */

interface Props {
  dataSummary: string;
  title?: string;
}

interface ParsedInsight {
  title: string;
  what: string;
  soWhat: string;
  nowWhat: string;
}

interface ParsedOutput {
  summary: string;
  insights: ParsedInsight[];
}

/* ─── Lightweight markdown renderer (bold, bullets, numbered lists) ─── */

function boldify(text: string): ReactNode[] {
  return text.split(/(\*\*.+?\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

function renderMarkdown(text: string): ReactNode {
  const lines = text.split("\n");
  const elements: ReactNode[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const cls =
        listType === "ul"
          ? "list-disc ml-4 space-y-0.5"
          : "list-decimal ml-4 space-y-0.5";
      elements.push(
        listType === "ul" ? (
          <ul key={elements.length} className={cls}>
            {listItems.map((item, j) => (
              <li key={j}>{boldify(item)}</li>
            ))}
          </ul>
        ) : (
          <ol key={elements.length} className={cls}>
            {listItems.map((item, j) => (
              <li key={j}>{boldify(item)}</li>
            ))}
          </ol>
        ),
      );
      listItems = [];
      listType = null;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[-*]\s/.test(trimmed)) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listItems.push(trimmed.replace(/^[-*]\s/, ""));
    } else if (/^\d+\.\s/.test(trimmed)) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listItems.push(trimmed.replace(/^\d+\.\s/, ""));
    } else {
      flushList();
      if (trimmed) {
        elements.push(
          <p key={elements.length}>{boldify(trimmed)}</p>,
        );
      }
    }
  }
  flushList();

  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-foreground/85">
      {elements}
    </div>
  );
}

/* ─── Response parser ─── */

function parseInsightsResponse(raw: string): ParsedOutput {
  // Extract summary
  const summaryMatch = raw.match(
    /SUMMARY:\s*(.+?)(?=\n---INSIGHT|\n\n---|\s*$)/s,
  );
  const summary = summaryMatch?.[1]?.trim() ?? "";

  // Split into insight blocks
  const insightBlocks = raw.split(/---INSIGHT\s*\d+---/).slice(1);
  const insights: ParsedInsight[] = insightBlocks
    .map((block) => {
      const titleMatch = block.match(/TITLE:\s*(.+?)(?=\nWHAT:|\n\n|$)/s);
      const whatMatch = block.match(/WHAT:\s*(.+?)(?=\nSO WHAT:|\n\n|$)/s);
      const soWhatMatch = block.match(
        /SO WHAT:\s*(.+?)(?=\nNOW WHAT:|\n\n|$)/s,
      );
      const nowWhatMatch = block.match(
        /NOW WHAT:\s*(.+?)(?=\n---INSIGHT|\n\n---|\s*$)/s,
      );
      return {
        title: titleMatch?.[1]?.trim() ?? "Insight",
        what: whatMatch?.[1]?.trim() ?? "",
        soWhat: soWhatMatch?.[1]?.trim() ?? "",
        nowWhat: nowWhatMatch?.[1]?.trim() ?? "",
      };
    })
    .filter((ins) => ins.what.length > 0);

  return { summary, insights };
}

/* ─── Section label colors ─── */

const SECTION_STYLES = {
  what: { label: "What", color: "text-primary" },
  soWhat: { label: "So What", color: "text-amber-500" },
  nowWhat: { label: "Now What", color: "text-emerald-500" },
} as const;

/* ─── Component ─── */

const SignalStackInsights = ({
  dataSummary,
  title = "SignalStack Intelligence",
}: Props) => {
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<ParsedOutput | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    setParsed(null);
    setRawText("");
    let full = "";

    await streamAiChat({
      messages: [
        {
          role: "user",
          content: `Based on this data summary, provide a concise executive summary (1-2 sentences) followed by exactly 4 strategic insights.

Format your response EXACTLY like this:

SUMMARY: [Your executive summary here using ZAR currency values]

---INSIGHT 1---
TITLE: [Short strategic title]
WHAT: [The specific data finding with exact numbers in ZAR]
SO WHAT: [The strategic implication — connect to mental availability, choice architecture, or competitive position]
NOW WHAT: [The recommended action — specific channel, retailer activation, or creative direction]

---INSIGHT 2---
TITLE: [Short strategic title]
WHAT: [Finding]
SO WHAT: [Implication]
NOW WHAT: [Action]

---INSIGHT 3---
TITLE: [Short strategic title]
WHAT: [Finding]
SO WHAT: [Implication]
NOW WHAT: [Action]

---INSIGHT 4---
TITLE: [Short strategic title]
WHAT: [Finding]
SO WHAT: [Implication]
NOW WHAT: [Action]

Apply Jon Evans' System 1 thinking (emotional resonance, distinctive assets, broad reach), Julian Cole's strategic narrative, and Rory Sutherland's behavioural economics (nudges, reframing, choice architecture). Be specific with South African retailer names and ZAR values.

Data:\n${dataSummary}`,
        },
      ],
      context: "insights",
      onDelta: (t) => {
        full += t;
      },
      onDone: () => {
        setRawText(full);
        const result = parseInsightsResponse(full);
        setParsed(result);
        setLoading(false);
      },
      onError: () => {
        setRawText("Unable to generate insights. Please try again.");
        setParsed({ summary: "", insights: [] });
        setLoading(false);
      },
    });
  };

  const copyInsight = (insight: ParsedInsight) => {
    const text = `${insight.title}\n\nWHAT: ${insight.what}\nSO WHAT: ${insight.soWhat}\nNOW WHAT: ${insight.nowWhat}`;
    navigator.clipboard.writeText(text).then(
      () => toast.success("Insight copied to clipboard"),
      () => toast.error("Failed to copy"),
    );
  };

  const copyAll = () => {
    if (!parsed) return;
    const text = [
      parsed.summary ? `SUMMARY: ${parsed.summary}\n` : "",
      ...parsed.insights.map(
        (ins, i) =>
          `${i + 1}. ${ins.title}\nWHAT: ${ins.what}\nSO WHAT: ${ins.soWhat}\nNOW WHAT: ${ins.nowWhat}`,
      ),
    ]
      .filter(Boolean)
      .join("\n\n");
    navigator.clipboard.writeText(text).then(
      () => toast.success("All insights copied"),
      () => toast.error("Failed to copy"),
    );
  };

  // Determine whether to render structured or fallback view
  const hasStructured = parsed && parsed.insights.length > 0;

  // Fallback: render raw text as simple blocks (legacy behavior)
  const fallbackLines = rawText
    .split(/\n/)
    .map((l) => l.replace(/^\d+[.)]\s*/, "").trim())
    .filter((l) => l.length > 10);

  return (
    <Card className="glass-card">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <h3 className="font-display text-sm font-bold">{title}</h3>
          </div>
          <div className="flex items-center gap-2">
            {hasStructured && (
              <Button
                size="sm"
                variant="ghost"
                onClick={copyAll}
                className="text-xs h-7 px-2"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy All
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={generate}
              disabled={loading}
              className="text-xs"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              Generate Insights
            </Button>
          </div>
        </div>

        {/* Content */}
        {hasStructured ? (
          <div className="space-y-3">
            {/* Executive Summary Callout */}
            {parsed.summary && (
              <div className="flex items-start gap-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 p-4">
                <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-foreground/90 leading-relaxed">
                  {parsed.summary}
                </p>
              </div>
            )}

            {/* Insight Cards with Accordion */}
            <Accordion type="multiple" className="space-y-2">
              {parsed.insights.map((insight, i) => (
                <AccordionItem
                  key={i}
                  value={`insight-${i}`}
                  className="border-0"
                >
                  <div className="relative rounded-lg border bg-card overflow-hidden glass-card">
                    {/* Gradient left accent */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary to-primary/30" />

                    <div className="pl-4">
                      {/* Title row */}
                      <div className="flex items-center justify-between pr-3 pt-3">
                        <h4 className="font-display text-sm font-semibold">
                          {insight.title}
                        </h4>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyInsight(insight);
                          }}
                          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
                          title="Copy insight"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Accordion trigger */}
                      <AccordionTrigger className="py-2 px-0 pr-3 text-xs text-muted-foreground hover:no-underline [&[data-state=open]>svg]:rotate-180">
                        <span className="flex items-center gap-1">
                          <ChevronDown className="h-3 w-3 transition-transform duration-200" />
                          View details
                        </span>
                      </AccordionTrigger>

                      {/* Accordion content */}
                      <AccordionContent>
                        <div className="space-y-3 pb-3 pr-3">
                          {(
                            [
                              ["what", insight.what],
                              ["soWhat", insight.soWhat],
                              ["nowWhat", insight.nowWhat],
                            ] as const
                          ).map(([key, text]) => {
                            if (!text) return null;
                            const style =
                              SECTION_STYLES[key];
                            return (
                              <div key={key}>
                                <p
                                  className={`text-[10px] uppercase tracking-wider font-semibold ${style.color} mb-1`}
                                >
                                  {style.label}
                                </p>
                                {renderMarkdown(text)}
                              </div>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </div>
                  </div>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ) : rawText && fallbackLines.length > 0 ? (
          /* Fallback: plain text blocks */
          <div className="space-y-2">
            {fallbackLines.map((ins, i) => (
              <div
                key={i}
                className="border-l-3 border-accent bg-accent/5 rounded-r-lg p-3 text-sm text-foreground/85 leading-relaxed"
              >
                {ins}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Click &ldquo;Generate Insights&rdquo; to get AI-powered strategic
            analysis.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default SignalStackInsights;
