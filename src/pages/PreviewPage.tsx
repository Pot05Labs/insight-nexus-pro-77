import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, AlertTriangle, ArrowRight, Inbox, Upload } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const PreviewPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [upload, setUpload] = useState<any>(null);
  const [sampleRows, setSampleRows] = useState<any[]>([]);

  useEffect(() => {
    const fetchLatest = async () => {
      setLoading(true);

      // Get most recent upload
      const { data: uploads } = await supabase
        .from("data_uploads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);

      const latestUpload = uploads?.[0] ?? null;
      setUpload(latestUpload);

      // Get sample harmonized rows
      const { data: rows } = await supabase
        .from("harmonized_sales")
        .select("*")
        .order("date", { ascending: false })
        .limit(20);

      setSampleRows(rows ?? []);
      setLoading(false);
    };
    fetchLatest();
  }, []);

  const totalRevenue = sampleRows.reduce((a, b) => a + (Number(b.revenue) || 0), 0);
  const totalUnits = sampleRows.reduce((a, b) => a + (b.units_sold ?? 0), 0);
  const skuCount = new Set(sampleRows.map((r) => r.sku).filter(Boolean)).size;
  const channelCount = new Set(sampleRows.map((r) => r.channel).filter(Boolean)).size;

  const columnMappings = upload?.column_mapping
    ? Object.entries(upload.column_mapping as Record<string, string>).map(([source, canonical]) => ({ source, canonical, confidence: 0.95 }))
    : upload?.column_names
      ? (upload.column_names as string[]).map((col: string) => ({ source: col, canonical: col.toLowerCase().replace(/\s+/g, "_"), confidence: 0.9 }))
      : [];

  const hasData = upload || sampleRows.length > 0;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Data Preview</h1>
          <p className="text-muted-foreground text-sm">Review classification and column mapping before confirming.</p>
        </div>
        <Button onClick={() => navigate("/dashboard")} disabled={!hasData}>
          Confirm & Proceed <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
          <Card><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
        </div>
      ) : !hasData ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Inbox className="h-10 w-10 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground mb-3">Upload a file first to see the classification preview.</p>
            <Link to="/upload"><Button variant="outline" size="sm"><Upload className="h-3.5 w-3.5 mr-1.5" />Go to Upload Hub</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Classification */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-base flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    Upload Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">File</span>
                    <span className="text-sm font-medium">{upload?.file_name ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Type</span>
                    <Badge className="bg-primary/10 text-primary border-primary/20">{upload?.source_type ?? "—"}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Source</span>
                    <span className="text-sm">{upload?.source_name ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant="outline">{upload?.status ?? "—"}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Rows</span>
                    <span className="text-sm font-semibold">{upload?.row_count ?? "—"}</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Metrics Preview */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-base">Extracted Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { metric: "Total Revenue", value: totalRevenue > 0 ? `$${(totalRevenue / 1000).toFixed(1)}K` : "—" },
                      { metric: "Total Units", value: totalUnits > 0 ? totalUnits.toLocaleString() : "—" },
                      { metric: "SKU Count", value: skuCount > 0 ? skuCount.toString() : "—" },
                      { metric: "Channels", value: channelCount > 0 ? channelCount.toString() : "—" },
                    ].map((m) => (
                      <div key={m.metric} className="rounded-lg bg-muted/60 p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{m.metric}</p>
                        <p className="font-display text-lg font-bold mt-0.5">{m.value}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Column Mapping */}
          {columnMappings.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-base">Column Mapping</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Source Column</TableHead>
                          <TableHead className="text-xs">→</TableHead>
                          <TableHead className="text-xs">Canonical Field</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {columnMappings.map((m) => (
                          <TableRow key={m.source}>
                            <TableCell className="text-sm font-medium">{m.source}</TableCell>
                            <TableCell className="text-muted-foreground">→</TableCell>
                            <TableCell><Badge variant="outline" className="font-mono text-xs">{m.canonical}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Data Preview */}
          {sampleRows.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-base">Harmonised Data Preview (latest {sampleRows.length} rows)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">SKU</TableHead>
                          <TableHead className="text-xs">Product</TableHead>
                          <TableHead className="text-xs text-right">Units</TableHead>
                          <TableHead className="text-xs text-right">Revenue</TableHead>
                          <TableHead className="text-xs">Channel</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sampleRows.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm">{r.date}</TableCell>
                            <TableCell><Badge variant="outline" className="font-mono text-[10px]">{r.sku ?? "—"}</Badge></TableCell>
                            <TableCell className="text-sm">{r.product_name ?? "—"}</TableCell>
                            <TableCell className="text-sm text-right font-medium">{(r.units_sold ?? 0).toLocaleString()}</TableCell>
                            <TableCell className="text-sm text-right font-medium">${(Number(r.revenue) || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-sm">{r.channel ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
};

export default PreviewPage;
