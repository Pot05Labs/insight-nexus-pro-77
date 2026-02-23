import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, FileDown, MessageSquare, Brain, Inbox, Upload, Send, Bot, User, Loader2, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { streamAiChat, type Msg } from "@/services/aiChatStream";

type ReportContent = {
  executive_summary?: string;
  insights?: { title: string; insight: string; data_point: string; implication: string }[];
  recommendations?: { title: string; description: string }[];
};

const InsightsPage = () => {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ReportContent | null>(null);
  const [generating, setGenerating] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchReport = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("narrative_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);
    const latest = data?.[0];
    if (latest?.content && typeof latest.content === "object") {
      setReport(latest.content as unknown as ReportContent);
    } else {
      setReport(null);
    }
    setLoading(false);
  };

  /** Generate a fresh AI report from live data */
  const generateReport = async () => {
    setGenerating(true);
    const dataContext = await buildDataContext();

    const prompt = `You are the Commerce Intelligence Harmoniser by Pot Labs. Generate a comprehensive strategic report based on the following South African FMCG sell-out data. ALL monetary values are in South African Rand (ZAR, use R prefix like R1,000).

${dataContext}

Return your response as valid JSON with this exact structure:
{
  "executive_summary": "2-3 sentence executive summary with key findings",
  "insights": [
    { "title": "Short title", "insight": "1-2 sentence insight", "data_point": "Specific metric/number (use R for ZAR)", "implication": "What this means for the business" }
  ],
  "recommendations": [
    { "title": "Recommendation title", "description": "Actionable recommendation with specifics" }
  ]
}

Include exactly 3-4 insights and 3 recommendations. Be specific with numbers. Use R prefix for all monetary values (South African Rand). Reference real retailer names from the data.`;

    let full = "";
    await streamAiChat({
      messages: [{ role: "user", content: prompt }],
      context: "insights",
      onDelta: (t) => { full += t; },
      onDone: () => {
        try {
          // Extract JSON from response (handle markdown code blocks)
          const jsonStr = full.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          const parsed = JSON.parse(jsonStr) as ReportContent;
          setReport(parsed);
        } catch {
          // Fallback: display as executive summary
          setReport({ executive_summary: full, insights: [], recommendations: [] });
        }
        setGenerating(false);
      },
      onError: () => {
        setReport({ executive_summary: "Unable to generate report. Please try again.", insights: [], recommendations: [] });
        setGenerating(false);
      },
    });
  };

  useEffect(() => { fetchReport(); }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const buildDataContext = async (): Promise<string> => {
    const [salesRes, metricsRes] = await Promise.all([
      supabase.from("sell_out_data").select("retailer, brand, product_name_raw, revenue, units_sold, date").order("date", { ascending: false }).limit(50),
      supabase.from("computed_metrics").select("metric_name, metric_value, dimensions").limit(30),
    ]);

    const parts: string[] = [];
    if (salesRes.data?.length) {
      const totalRev = salesRes.data.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
      const totalUnits = salesRes.data.reduce((s, r) => s + (Number(r.units_sold) || 0), 0);
      const retailers = [...new Set(salesRes.data.map(r => r.retailer).filter(Boolean))];
      const brands = [...new Set(salesRes.data.map(r => r.brand).filter(Boolean))];
      parts.push(`SELL-OUT SUMMARY (latest ${salesRes.data.length} rows): Total Revenue: R${totalRev.toLocaleString()} (ZAR), Total Units: ${totalUnits.toLocaleString()}, Retailers: ${retailers.join(", ") || "N/A"}, Brands: ${brands.join(", ") || "N/A"}`);
    }
    if (metricsRes.data?.length) {
      const metricsSummary = metricsRes.data.map(m => `${m.metric_name}: ${m.metric_value}`).join("; ");
      parts.push(`COMPUTED METRICS: ${metricsSummary}`);
    }
    return parts.length ? `\n\n[DATA CONTEXT]\n${parts.join("\n")}` : "";
  };

  const send = async (text: string) => {
    if (!text.trim() || chatLoading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setChatLoading(true);

    const dataContext = await buildDataContext();
    const enrichedMessages = [...messages, { ...userMsg, content: userMsg.content + dataContext }];

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      await streamAiChat({
        messages: enrichedMessages,
        context: "insights",
        onDelta: upsert,
        onDone: () => setChatLoading(false),
        onError: (msg) => { upsert(`⚠️ ${msg}`); setChatLoading(false); },
      });
    } catch {
      upsert("⚠️ Something went wrong. Please try again.");
      setChatLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const insights = report?.insights ?? [];
  const recommendations = report?.recommendations ?? [];
  const summary = report?.executive_summary ?? "";

  const chatSuggestions = [
    "What are the key takeaways from my data?",
    "Which retailer is driving the most revenue?",
    "What's my ROAS looking like?",
    "Any underperforming products I should watch?",
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">AI Insights</h1>
          <p className="text-muted-foreground text-sm">Commerce Intelligence Harmoniser by Pot Labs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={generateReport} disabled={generating}>
            {generating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            {generating ? "Generating..." : "Regenerate"}
          </Button>
          <Button variant="outline" size="sm"><FileDown className="h-3.5 w-3.5 mr-1.5" />Export to PDF</Button>
          <Button variant="outline" size="sm"><MessageSquare className="h-3.5 w-3.5 mr-1.5" />Send to WhatsApp</Button>
        </div>
      </div>

      {/* Report Section */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <div className="grid md:grid-cols-3 gap-4">
            <Skeleton className="h-48" /><Skeleton className="h-48" /><Skeleton className="h-48" />
          </div>
        </div>
      ) : !report ? (
        <Card>
          <CardContent className="p-12 text-center">
            {generating ? (
              <>
                <Loader2 className="h-10 w-10 mx-auto text-primary animate-spin mb-4" />
                <p className="text-muted-foreground mb-3">Generating AI-powered strategic report from your data...</p>
              </>
            ) : (
              <>
                <Sparkles className="h-10 w-10 mx-auto text-primary/40 mb-4" />
                <p className="text-muted-foreground mb-3">Generate an AI-powered strategic report from your sell-out and campaign data.</p>
                <div className="flex gap-2 justify-center">
                  <Button variant="default" size="sm" onClick={generateReport}>
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />Generate Report
                  </Button>
                  <Link to="/upload"><Button variant="outline" size="sm"><Upload className="h-3.5 w-3.5 mr-1.5" />Upload More Data</Button></Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {summary && (
            <Card className="border-primary/20 bg-primary/3">
              <CardHeader>
                <CardTitle className="font-display text-base flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />Executive Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed italic text-foreground/80">{summary}</p>
              </CardContent>
            </Card>
          )}
          {insights.length > 0 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {insights.map((card, i) => (
                <motion.div key={card.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                  <Card className="h-full flex flex-col">
                    <CardHeader className="pb-2"><CardTitle className="font-display text-sm leading-snug">{card.title}</CardTitle></CardHeader>
                    <CardContent className="flex-1 space-y-3">
                      <p className="text-sm text-foreground/80 leading-relaxed">{card.insight}</p>
                      <div className="rounded-md bg-primary/5 px-3 py-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Data Point</p>
                        <p className="text-sm font-semibold text-primary">{card.data_point}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Implication</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">{card.implication}</p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
          {recommendations.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="font-display text-lg font-bold mb-4">Forward-Looking Recommendations</h3>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recommendations.map((rec, i) => (
                    <motion.div key={rec.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                      <Card className="border-accent/20 h-full">
                        <CardContent className="p-5">
                          <div className="flex items-start gap-3">
                            <div className="h-6 w-6 rounded-full bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-xs font-bold text-accent">{i + 1}</span>
                            </div>
                            <div>
                              <p className="font-display text-sm font-semibold mb-1">{rec.title}</p>
                              <p className="text-sm text-muted-foreground leading-relaxed">{rec.description}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* AI Chat Section */}
      <Separator />
      <div>
        <h3 className="font-display text-lg font-bold mb-1 flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />Ask the Harmoniser
        </h3>
        <p className="text-muted-foreground text-sm mb-4">Chat with your data — powered by GPT-4o with live sell-out and metrics context.</p>

        <Card className="flex flex-col" style={{ height: "420px" }}>
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12">
                <Bot className="h-10 w-10 text-muted-foreground/20 mb-4" />
                <p className="text-muted-foreground text-sm mb-4">Ask anything about your commerce data</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                  {chatSuggestions.map(s => (
                    <button key={s} onClick={() => send(s)}
                      className="text-left text-sm p-3 rounded-lg border border-border hover:bg-muted hover:border-primary/20 transition-all">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((m, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
                    {m.role === "assistant" && (
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div className={`rounded-xl px-4 py-2.5 max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}>{m.content}</div>
                    {m.role === "user" && (
                      <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </motion.div>
                ))}
                {chatLoading && messages[messages.length - 1]?.role === "user" && (
                  <div className="flex gap-3">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Loader2 className="h-4 w-4 text-primary animate-spin" />
                    </div>
                    <div className="bg-muted rounded-xl px-4 py-2.5 text-sm">Thinking...</div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
          <div className="border-t p-4 flex gap-2">
            <Textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
              placeholder="Ask about your sales, campaigns, or metrics..." className="min-h-[44px] max-h-32 resize-none text-sm" rows={1} />
            <Button onClick={() => send(input)} disabled={!input.trim() || chatLoading} size="icon" className="shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default InsightsPage;
