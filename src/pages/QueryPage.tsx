import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Bot, User, Loader2, Upload, Inbox, Table as TableIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { streamAiChat, type Msg } from "@/services/aiChatStream";

type QueryResult = { columns: string[]; rows: Record<string, unknown>[] };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

const suggestions = [
  "Show me top 5 products by revenue",
  "Compare channels by units sold",
  "What was the top campaign by spend?",
  "Summarise sales by retailer",
];

const QueryPage = () => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [queryResults, setQueryResults] = useState<Record<number, QueryResult>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const init = async () => {
      // Check both sell_out_data and campaign_data_v2 for data availability
      const [soRes, cpRes] = await Promise.all([
        supabase.from("sell_out_data").select("id", { count: "exact", head: true }).is("deleted_at", null),
        supabase.from("campaign_data_v2").select("id", { count: "exact", head: true }).is("deleted_at", null),
      ]);
      setHasData(((soRes.count ?? 0) + (cpRes.count ?? 0)) > 0);

      const { data } = await supabase
        .from("chat_messages")
        .select("role, content")
        .order("created_at", { ascending: true })
        .limit(100);
      if (data && data.length > 0) {
        setMessages(data.map(d => ({ role: d.role as "user" | "assistant", content: d.content })));
      }
    };
    init();
  }, []);

  const persistMessage = async (role: "user" | "assistant", content: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.from("chat_messages").insert({ user_id: session.user.id, role, content });
  };

  const executeQuery = async (querySpec: { table: string; select: string; filters?: { column: string; operator: string; value: string }[]; order?: { column: string; ascending: boolean }; limit?: number }): Promise<QueryResult | null> => {
    try {
      const validTables = ["sell_out_data", "campaign_data_v2", "computed_metrics"];
      if (!validTables.includes(querySpec.table)) return null;

      let query = supabase.from(querySpec.table as any).select(querySpec.select);

      // Always exclude soft-deleted rows
      if (["sell_out_data", "campaign_data_v2", "narrative_reports", "computed_metrics"].includes(querySpec.table)) {
        query = query.is("deleted_at", null);
      }

      if (querySpec.filters) {
        for (const f of querySpec.filters) {
          if (f.operator === "eq") query = query.eq(f.column, f.value);
          else if (f.operator === "neq") query = query.neq(f.column, f.value);
          else if (f.operator === "gt") query = query.gt(f.column, f.value);
          else if (f.operator === "gte") query = query.gte(f.column, f.value);
          else if (f.operator === "lt") query = query.lt(f.column, f.value);
          else if (f.operator === "lte") query = query.lte(f.column, f.value);
          else if (f.operator === "like") query = query.like(f.column, f.value);
          else if (f.operator === "ilike") query = query.ilike(f.column, f.value);
        }
      }

      if (querySpec.order) query = query.order(querySpec.order.column, { ascending: querySpec.order.ascending });
      if (querySpec.limit) query = query.limit(querySpec.limit);

      const { data, error } = await query;
      if (error || !data?.length) return null;

      const rows = data as unknown as Record<string, unknown>[];
      const columns = Object.keys(rows[0]);
      return { columns, rows };
    } catch {
      return null;
    }
  };

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    await persistMessage("user", userMsg.content);

    let assistantSoFar = "";
    const msgIndex = messages.length + 1; // index of incoming assistant message

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
      // Get user session for authenticated Edge Function calls
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) {
        upsert("⚠️ Not logged in. Please sign in to use query features.");
        setLoading(false);
        return;
      }

      // First, get the AI to generate a query spec (non-streaming for structured output)
      const queryResp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authSession.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ messages: [...messages, userMsg], context: "query" }),
      });

      if (!queryResp.ok || !queryResp.body) {
        upsert("⚠️ Failed to connect to AI.");
        setLoading(false);
        return;
      }

      // Collect full response for query parsing
      const reader = queryResp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let fullText = "";
      let streamDone = false;

      while (!streamDone) {
        const { done: rd, value } = await reader.read();
        if (rd) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || !line.trim() || !line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { streamDone = true; break; }
          try {
            const parsed = JSON.parse(json);
            const c = parsed.choices?.[0]?.delta?.content;
            if (c) fullText += c;
          } catch { buf = line + "\n" + buf; break; }
        }
      }

      // Try to parse query spec from AI response
      let querySpec = null;
      try {
        const jsonMatch = fullText.match(/\{[\s\S]*\}/);
        if (jsonMatch) querySpec = JSON.parse(jsonMatch[0]);
      } catch { /* not valid JSON */ }

      if (querySpec?.table && querySpec?.select) {
        const result = await executeQuery(querySpec);
        const explanation = querySpec.explanation || "Query executed successfully.";

        if (result && result.rows.length > 0) {
          upsert(explanation);
          setQueryResults(prev => ({ ...prev, [msgIndex]: result }));
        } else {
          upsert(`${explanation}\n\nNo results found for this query.`);
        }
      } else {
        // AI returned a natural language response instead of query spec
        upsert(fullText);
      }

      setLoading(false);
      if (assistantSoFar) await persistMessage("assistant", assistantSoFar);
    } catch {
      upsert("⚠️ Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 lg:p-8 pb-0">
        <h1 className="font-display text-2xl font-bold">Query</h1>
        <p className="text-muted-foreground text-sm">Natural language data explorer — Commerce Intelligence Harmoniser by Pot Labs</p>
      </div>

      <div className="flex-1 flex flex-col min-h-0 p-6 lg:p-8">
        <Card className="flex-1 flex flex-col min-h-0 border-border">
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            {hasData === false ? (
              <div className="flex flex-col items-center justify-center h-full py-16">
                <Inbox className="h-10 w-10 text-muted-foreground/20 mb-4" />
                <p className="text-muted-foreground text-sm mb-2">Upload and process data first to start querying.</p>
                <Link to="/upload">
                  <Button variant="outline" size="sm"><Upload className="h-3.5 w-3.5 mr-1.5" />Go to Upload Hub</Button>
                </Link>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16">
                <Bot className="h-10 w-10 text-muted-foreground/20 mb-4" />
                <p className="text-muted-foreground text-sm mb-6">Ask anything about your commerce data</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                  {suggestions.map(s => (
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
                  <div key={i}>
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
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

                    {/* Query result table */}
                    {queryResults[i] && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="ml-10 mt-3">
                        <Card className="overflow-hidden">
                          <div className="px-4 py-2 border-b bg-muted/50 flex items-center gap-2">
                            <TableIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground">{queryResults[i].rows.length} results</span>
                          </div>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  {queryResults[i].columns.map(col => (
                                    <TableHead key={col} className="text-xs font-semibold whitespace-nowrap">{col}</TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {queryResults[i].rows.map((row, ri) => (
                                  <TableRow key={ri}>
                                    {queryResults[i].columns.map(col => (
                                      <TableCell key={col} className="text-xs whitespace-nowrap">
                                        {row[col] != null ? String(row[col]) : "—"}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </Card>
                      </motion.div>
                    )}
                  </div>
                ))}
                {loading && messages[messages.length - 1]?.role === "user" && (
                  <div className="flex gap-3">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Loader2 className="h-4 w-4 text-primary animate-spin" />
                    </div>
                    <div className="bg-muted rounded-xl px-4 py-2.5 text-sm">Analysing your data...</div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          <div className="border-t p-4 flex gap-2">
            <Textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
              placeholder="e.g. Show me top 5 products by revenue last month..." className="min-h-[44px] max-h-32 resize-none text-sm" rows={1}
              disabled={hasData === false} />
            <Button onClick={() => send(input)} disabled={!input.trim() || loading || hasData === false} size="icon" className="shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default QueryPage;
