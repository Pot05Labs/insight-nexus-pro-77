import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle, Loader2, Brain, Search, Calculator, PenTool, FileSearch, Trash2, Inbox, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import JSZip from "jszip";

type AgentStatus = "pending" | "running" | "done";
type ProcessingStage = { agent: string; label: string; icon: any; status: AgentStatus };

type UploadFile = {
  file: File;
  id: string;
  status: "pending" | "uploading" | "processing" | "done" | "error";
  progress: number;
  sourceName: string;
  sourceType: string;
  preview?: string[][];
  columns?: string[];
  error?: string;
  processingMessage?: string;
  agents: ProcessingStage[];
};

type ExistingUpload = {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  source_name: string | null;
  source_type: string | null;
  status: string;
  created_at: string;
  row_count: number | null;
  storage_path: string;
};

const createAgents = (): ProcessingStage[] => [
  { agent: "Agent 1", label: "File Intelligence", icon: FileSearch, status: "pending" },
  { agent: "Agent 2", label: "Data Extractor", icon: Search, status: "pending" },
  { agent: "Agent 3", label: "Entity Resolver", icon: Brain, status: "pending" },
  { agent: "Agent 4", label: "Metrics Engine", icon: Calculator, status: "pending" },
  { agent: "Agent 5", label: "Narrative Analyst", icon: PenTool, status: "pending" },
];

const stageLabels = ["Classifying...", "Extracting...", "Matching...", "Computing...", "Analysing..."];

const UploadPage = () => {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [existingUploads, setExistingUploads] = useState<ExistingUpload[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ExistingUpload | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchUploads = async () => {
    setLoadingUploads(true);
    const { data } = await supabase
      .from("data_uploads")
      .select("id, file_name, file_type, file_size, source_name, source_type, status, created_at, row_count, storage_path")
      .order("created_at", { ascending: false });
    setExistingUploads(data ?? []);
    setLoadingUploads(false);
  };

  useEffect(() => { fetchUploads(); }, []);

  const parseCSV = (text: string) => {
    const lines = text.split("\n").filter((l) => l.trim());
    const columns = lines[0]?.split(",").map((c) => c.trim().replace(/^"|"$/g, "")) ?? [];
    const rows = lines.slice(1, 6).map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
    return { columns, rows };
  };

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const newFiles: UploadFile[] = Array.from(incoming)
      .filter((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase();
        return ["csv", "xlsx", "xls", "pptx", "pdf"].includes(ext ?? "");
      })
      .map((f) => ({
        file: f, id: crypto.randomUUID(), status: "pending" as const, progress: 0,
        sourceName: "", sourceType: "retailer", agents: createAgents(),
      }));

    if (newFiles.length === 0) {
      toast({ title: "Unsupported file", description: "Supports CSV, XLSX, PPTX, PDF.", variant: "destructive" });
      return;
    }

    newFiles.forEach((uf) => {
      if (uf.file.name.endsWith(".csv")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          const { columns, rows } = parseCSV(text);
          setFiles((prev) => prev.map((f) => (f.id === uf.id ? { ...f, columns, preview: rows } : f)));
        };
        reader.readAsText(uf.file);
      }
    });

    setFiles((prev) => [...prev, ...newFiles]);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));
  const updateFile = (id: string, updates: Partial<UploadFile>) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));

  /* ---- helpers for inline processing ---- */
  const norm = (s: string) => s.trim().replace(/^["']|["']$/g, "").toLowerCase();
  const toNum = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace(/[£$€,\s]/g, ""));
    return isNaN(n) ? null : n;
  };
  const toDate = (v: unknown): string | null => {
    if (!v) return null;
    const s = String(v).trim();
    if (/^\d{5}$/.test(s)) {
      const d = new Date(new Date(1899, 11, 30).getTime() + Number(s) * 86400000);
      return d.toISOString().split("T")[0];
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
  };

  const SELL_OUT_ALIASES: Record<string, string[]> = {
    date: ["date","week","period","month","day","report_date","sale_date","transaction_date","order_date","invoice_date"],
    product_name_raw: ["product","product_name","product_name_raw","item","description","product_description","item_name","title","product_title","item_description"],
    sku: ["sku","sku_code","ean","barcode","upc","asin","product_code","item_code","article","article_code","material","material_code"],
    retailer: ["retailer","channel","store","marketplace","outlet","account","customer","store_name","account_name","partner"],
    store_location: ["store_location","location","store_loc","outlet_location"],
    region: ["region","area","territory","geo","geography","market"],
    category: ["category","product_category","cat","segment","product_group"],
    brand: ["brand","brand_name","manufacturer"],
    sub_brand: ["sub_brand","subbrand","sub_brand_name","variant"],
    format_size: ["format_size","format","size","pack_size","pack","packaging"],
    revenue: ["revenue","sales","total_sales","net_sales","gross_sales","sales_value","ordered_value","amount","value","turnover","net_revenue","gross_revenue","total_value"],
    units_sold: ["units","units_sold","qty","quantity","volume","units_ordered","qty_sold","sold_qty","total_units"],
    units_supplied: ["units_supplied","supplied","supply_qty","qty_supplied","delivered","units_delivered"],
    cost: ["cost","cogs","cost_of_goods","unit_cost","total_cost","cost_value","cost_price"],
  };
  const CAMPAIGN_ALIASES: Record<string, string[]> = {
    flight_start: ["date","day","report_date","start_date","flight_start","campaign_date"],
    flight_end: ["end_date","flight_end","campaign_end"],
    platform: ["platform","source","network","media","media_channel","ad_platform"],
    channel: ["channel","media_type","channel_type"],
    campaign_name: ["campaign","campaign_name","campaign_title","name","campaign_id"],
    spend: ["spend","cost","total_spend","media_spend","ad_spend","amount_spent","media_cost","investment"],
    impressions: ["impressions","impressions_paid","imps","views","total_impressions"],
    clicks: ["clicks","link_clicks","total_clicks"],
    ctr: ["ctr","click_through_rate","click_rate"],
    conversions: ["conversions","purchases","orders","actions","results","total_conversions"],
    revenue: ["revenue","purchase_value","conversion_value","roas_value","value","sales_value","attributed_revenue"],
    total_sales_attributed: ["total_sales_attributed","attributed_sales","sales_attributed"],
    total_units_attributed: ["total_units_attributed","attributed_units","units_attributed"],
  };
  const SO_SIGNALS = ["units_sold","units_supplied","sales_value","retailer","sku_code","product_name","store","store_name","barcode","ean","upc","asin","cogs","sell_out","qty_sold","sold_qty","gross_sales","net_sales","turnover","store_location","region","category","brand","sub_brand","format_size","ordered_value","units_ordered"];
  const CP_SIGNALS = ["impressions","impressions_paid","clicks","spend","ad_spend","media_spend","total_spend","ctr","cpm","cpc","roas","campaign","campaign_name","ad_group","adset","ad_set","platform","conversions","flight_start","flight_end","media_cost","investment","total_sales_attributed","total_units_attributed"];

  const detectType = (headers: string[]) => {
    const nh = headers.map(norm);
    let so = 0, cp = 0;
    for (const h of nh) {
      if (SO_SIGNALS.some(s => h === s || h.includes(s))) so++;
      if (CP_SIGNALS.some(s => h === s || h.includes(s))) cp++;
    }
    return cp > so ? "campaign" : "sell_out";
  };

  const buildFieldMap = (headers: string[], aliases: Record<string, string[]>) => {
    const map: Record<string, string> = {};
    const nh = headers.map(norm);
    for (const [canonical, alts] of Object.entries(aliases)) {
      for (const alt of alts) {
        const idx = nh.indexOf(alt);
        if (idx !== -1) { map[canonical] = headers[idx]; break; }
      }
      if (!map[canonical]) {
        for (const alt of alts) {
          const idx = nh.findIndex(h => h.includes(alt) || alt.includes(h));
          if (idx !== -1) { map[canonical] = headers[idx]; break; }
        }
      }
    }
    return map;
  };

  const parsePptxToRows = async (blob: Blob): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> => {
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const allRows: string[][] = [];

    const slideFiles = Object.keys(zip.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => {
        const na = parseInt(a.match(/slide(\d+)/i)?.[1] ?? "0");
        const nb = parseInt(b.match(/slide(\d+)/i)?.[1] ?? "0");
        return na - nb;
      });

    const domParser = new DOMParser();

    for (const slidePath of slideFiles) {
      const xml = await zip.files[slidePath].async("text");
      const doc = domParser.parseFromString(xml, "application/xml");

      // Use DOMParser for reliable XML table extraction
      const tables = doc.getElementsByTagName("a:tbl");
      for (let t = 0; t < tables.length; t++) {
        const tbl = tables[t];
        const trs = tbl.getElementsByTagName("a:tr");
        for (let r = 0; r < trs.length; r++) {
          const tr = trs[r];
          const tcs = tr.getElementsByTagName("a:tc");
          const cells: string[] = [];
          for (let c = 0; c < tcs.length; c++) {
            const textNodes = tcs[c].getElementsByTagName("a:t");
            const parts: string[] = [];
            for (let n = 0; n < textNodes.length; n++) {
              parts.push(textNodes[n].textContent?.trim() ?? "");
            }
            cells.push(parts.join(" ").trim());
          }
          if (cells.length > 0 && cells.some(c => c !== "")) allRows.push(cells);
        }
      }
    }

    if (allRows.length < 2) throw new Error("No data tables found in this PowerPoint file. Please upload campaign data as CSV or XLSX instead.");

    const headers = allRows[0];
    const dataRows = allRows.slice(1).map(row => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => { obj[h] = row[i] ?? null; });
      return obj;
    });
    return { headers, rows: dataRows };
  };

  const parseFileToRows = async (blob: Blob, fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    const isPptx = ext === "pptx" || blob.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    if (ext === "csv") {
      const text = await blob.text();
      const lines = text.split("\n").filter(l => l.trim());
      const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
      const rows = lines.slice(1).map(l => {
        const values: string[] = []; let cur = ""; let inQ = false;
        for (const c of l) { if (c === '"') { inQ = !inQ; continue; } if (c === "," && !inQ) { values.push(cur.trim()); cur = ""; continue; } cur += c; }
        values.push(cur.trim());
        const obj: Record<string, unknown> = {};
        headers.forEach((h, i) => { obj[h] = values[i] ?? null; });
        return obj;
      });
      return { headers, rows };
    }
    if (isPptx) {
      return parsePptxToRows(blob);
    }
    // Try XLSX/XLS — wrap in try/catch to detect misidentified files
    try {
      const buffer = await blob.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
      const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
      return { headers, rows };
    } catch (xlsxErr: any) {
      // If XLSX parsing fails, try as PPTX (ZIP-based Office file)
      try {
        return await parsePptxToRows(blob);
      } catch {
        throw new Error(xlsxErr.message || "Could not parse file");
      }
    }
  };

  const processInline = async (blob: Blob, fileName: string, uploadId: string, userId: string, sourceName: string | null) => {
    const { headers, rows: jsonRows } = await parseFileToRows(blob, fileName);
    if (!headers.length || !jsonRows.length) throw new Error("No data found in file");

    const detectedType = detectType(headers);
    const isCampaign = detectedType === "campaign";
    const fieldMap = buildFieldMap(headers, isCampaign ? CAMPAIGN_ALIASES : SELL_OUT_ALIASES);

    // Get or create project
    const { data: proj } = await supabase.from("projects").select("id").limit(1).single();
    let projectId: string;
    if (!proj) {
      const { data: np, error: pe } = await supabase.from("projects").insert({ user_id: userId, name: "Default Project" }).select("id").single();
      if (pe || !np) throw new Error("Could not create project");
      projectId = np.id;
    } else {
      projectId = proj.id;
    }

    await supabase.from("data_uploads").update({
      column_names: headers, data_type: detectedType, column_mapping: fieldMap,
      source_type: isCampaign ? "ad_platform" : "retailer", status: "processing", project_id: projectId,
    }).eq("id", uploadId);

    const gf = (row: Record<string, unknown>, key: string) => { const hk = fieldMap[key]; return hk ? row[hk] : null; };

    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < jsonRows.length; i += BATCH) {
      const batch = jsonRows.slice(i, i + BATCH);
      if (isCampaign) {
        const recs = batch.map(row => ({
          user_id: userId, project_id: projectId, upload_id: uploadId,
          flight_start: toDate(gf(row,"flight_start")), flight_end: toDate(gf(row,"flight_end")),
          platform: gf(row,"platform") ? String(gf(row,"platform")) : null,
          channel: gf(row,"channel") ? String(gf(row,"channel")) : null,
          campaign_name: gf(row,"campaign_name") ? String(gf(row,"campaign_name")) : null,
          spend: toNum(gf(row,"spend")), impressions: toNum(gf(row,"impressions")) ? Math.round(toNum(gf(row,"impressions"))!) : null,
          clicks: toNum(gf(row,"clicks")) ? Math.round(toNum(gf(row,"clicks"))!) : null,
          ctr: toNum(gf(row,"ctr")), conversions: toNum(gf(row,"conversions")) ? Math.round(toNum(gf(row,"conversions"))!) : null,
          revenue: toNum(gf(row,"revenue")), total_sales_attributed: toNum(gf(row,"total_sales_attributed")),
          total_units_attributed: toNum(gf(row,"total_units_attributed")) ? Math.round(toNum(gf(row,"total_units_attributed"))!) : null,
        }));
        const { error } = await supabase.from("campaign_data_v2").insert(recs);
        if (error) console.error("Campaign insert error:", error.message); else inserted += recs.length;
      } else {
        const recs = batch.map(row => ({
          user_id: userId, project_id: projectId, upload_id: uploadId,
          date: toDate(gf(row,"date")), product_name_raw: gf(row,"product_name_raw") ? String(gf(row,"product_name_raw")) : null,
          sku: gf(row,"sku") ? String(gf(row,"sku")) : null,
          retailer: gf(row,"retailer") ? String(gf(row,"retailer")) : (sourceName || null),
          store_location: gf(row,"store_location") ? String(gf(row,"store_location")) : null,
          region: gf(row,"region") ? String(gf(row,"region")) : null,
          category: gf(row,"category") ? String(gf(row,"category")) : null,
          brand: gf(row,"brand") ? String(gf(row,"brand")) : null,
          sub_brand: gf(row,"sub_brand") ? String(gf(row,"sub_brand")) : null,
          format_size: gf(row,"format_size") ? String(gf(row,"format_size")) : null,
          revenue: toNum(gf(row,"revenue")), units_sold: toNum(gf(row,"units_sold")) ? Math.round(toNum(gf(row,"units_sold"))!) : null,
          units_supplied: toNum(gf(row,"units_supplied")), cost: toNum(gf(row,"cost")),
        }));
        const { error } = await supabase.from("sell_out_data").insert(recs);
        if (error) console.error("Sell-out insert error:", error.message); else inserted += recs.length;
      }
      await new Promise(r => setTimeout(r, 50));
    }

    // Compute metrics
    if (!isCampaign && inserted > 0) {
      const { data: sd } = await supabase.from("sell_out_data").select("revenue,units_sold,units_supplied,sku,retailer").eq("upload_id", uploadId);
      if (sd?.length) {
        const tr = sd.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
        const tu = sd.reduce((s, r) => s + Number(r.units_sold ?? 0), 0);
        const ts = sd.reduce((s, r) => s + Number(r.units_supplied ?? 0), 0);
        await supabase.from("computed_metrics").insert({
          user_id: userId, project_id: projectId, metric_name: "sell_out_summary", metric_value: null,
          dimensions: { total_revenue: tr, total_units: tu, unique_skus: new Set(sd.map(r => r.sku).filter(Boolean)).size, unique_retailers: new Set(sd.map(r => r.retailer).filter(Boolean)).size, fill_rate: tu > 0 ? Math.round((ts / tu) * 10000) / 10000 : 0 },
        });
      }
    }
    if (isCampaign && inserted > 0) {
      const { data: cd } = await supabase.from("campaign_data_v2").select("spend,impressions,clicks,conversions,total_sales_attributed,total_units_attributed").eq("upload_id", uploadId);
      if (cd?.length) {
        const sp = cd.reduce((s, r) => s + Number(r.spend ?? 0), 0);
        const im = cd.reduce((s, r) => s + Number(r.impressions ?? 0), 0);
        const cl = cd.reduce((s, r) => s + Number(r.clicks ?? 0), 0);
        const cv = cd.reduce((s, r) => s + Number(r.conversions ?? 0), 0);
        const sa = cd.reduce((s, r) => s + Number(r.total_sales_attributed ?? 0), 0);
        const ua = cd.reduce((s, r) => s + Number(r.total_units_attributed ?? 0), 0);
        await supabase.from("computed_metrics").insert({
          user_id: userId, project_id: projectId, metric_name: "campaign_summary", metric_value: null,
          dimensions: { total_spend: Math.round(sp * 100) / 100, total_impressions: im, total_clicks: cl, avg_ctr: im > 0 ? Math.round((cl / im) * 10000) / 100 : 0, avg_cpc: cl > 0 ? Math.round((sp / cl) * 100) / 100 : 0, roas: sp > 0 ? Math.round((sa / sp) * 100) / 100 : 0, cps: ua > 0 ? Math.round((sp / ua) * 100) / 100 : 0, total_conversions: cv },
        });
      }
    }

    await supabase.from("data_uploads").update({
      status: inserted > 0 ? "ready" : "error", row_count: inserted,
      error_message: inserted === 0 ? "No rows could be parsed." : null,
    }).eq("id", uploadId);

    return { rowsInserted: inserted, detectedType };
  };

  const runProcessing = async (fileId: string, uploadId: string, file: File, sourceName: string | null, userId: string) => {
    updateFile(fileId, { status: "processing", progress: 20, processingMessage: "Parsing file..." });
    try {
      const result = await processInline(file, file.name, uploadId, userId, sourceName);

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, agents: f.agents.map((a) => ({ ...a, status: "done" as AgentStatus })) }
            : f
        )
      );

      if (result.rowsInserted === 0) {
        updateFile(fileId, { status: "error", error: "No rows could be parsed. Check column headers match expected format.", processingMessage: undefined });
      } else {
        updateFile(fileId, { status: "done", progress: 100, processingMessage: "Done!" });
        toast({ title: "File processed", description: `${result.rowsInserted} rows inserted.` });
      }
    } catch (err: any) {
      updateFile(fileId, { status: "error", error: err.message || "Processing failed", processingMessage: undefined });
    }
    fetchUploads();
  };

  const uploadFile = async (uf: UploadFile) => {
    updateFile(uf.id, { status: "uploading", progress: 10 });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      updateFile(uf.id, { status: "error", error: "You must be logged in to upload files." });
      return;
    }

    const storagePath = `${session.user.id}/${uf.id}-${uf.file.name}`;
    updateFile(uf.id, { progress: 30 });

    const { error: storageError } = await supabase.storage.from("uploads").upload(storagePath, uf.file);
    if (storageError) { updateFile(uf.id, { status: "error", error: storageError.message }); return; }

    updateFile(uf.id, { progress: 50 });

    const ext = uf.file.name.split(".").pop()?.toLowerCase() ?? "csv";
    const { data: dbData, error: dbError } = await supabase.from("data_uploads").insert({
      user_id: session.user.id,
      file_name: uf.file.name,
      file_type: ext,
      file_size: uf.file.size,
      storage_path: storagePath,
      source_name: uf.sourceName || null,
      source_type: uf.sourceType || "retailer",
      column_names: uf.columns ?? null,
      row_count: null,
      status: "processing",
    }).select("id").single();
    if (dbError || !dbData) { updateFile(uf.id, { status: "error", error: dbError?.message ?? "Insert failed" }); return; }

    updateFile(uf.id, { status: "processing" });
    await runProcessing(uf.id, dbData.id, uf.file, uf.sourceName || null, session.user.id);
    fetchUploads();
  };

  const uploadAll = async () => {
    const pending = files.filter((f) => f.status === "pending");
    for (const f of pending) await uploadFile(f);
    toast({ title: "Processing complete", description: `${pending.length} file(s) uploaded.` });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    // Delete related data first
    await Promise.all([
      supabase.from("sell_out_data").delete().eq("upload_id", deleteTarget.id),
      supabase.from("campaign_data_v2").delete().eq("upload_id", deleteTarget.id),
      supabase.from("harmonized_sales").delete().eq("upload_id", deleteTarget.id),
      supabase.from("campaign_data").delete().eq("upload_id", deleteTarget.id),
    ]);

    // Delete from storage
    const { data: upload } = await supabase.from("data_uploads").select("storage_path").eq("id", deleteTarget.id).single();
    if (upload?.storage_path) {
      await supabase.storage.from("uploads").remove([upload.storage_path]);
    }

    // Delete upload record
    await supabase.from("data_uploads").delete().eq("id", deleteTarget.id);

    setDeleting(false);
    setDeleteTarget(null);
    toast({ title: "File deleted", description: `${deleteTarget.file_name} and related data removed.` });
    fetchUploads();
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Upload Hub</h1>
        <p className="text-muted-foreground text-sm">Upload retailer sell-out data and campaign reports for harmonisation.</p>
      </div>

      {/* Drop zone */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
        }`}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
        <p className="font-medium mb-1">Drop files here or click to browse</p>
        <p className="text-sm text-muted-foreground">Supports CSV, XLSX, PPTX, PDF</p>
        <input id="file-input" type="file" className="hidden" accept=".csv,.xlsx,.xls,.pptx,.pdf" multiple
          onChange={(e) => e.target.files && addFiles(e.target.files)} />
      </motion.div>

      {/* Staged files */}
      <AnimatePresence>
        {files.map((uf) => (
          <motion.div key={uf.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-sm font-medium">{uf.file.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{(uf.file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {uf.status === "done" && <Badge className="bg-success/10 text-success border-success/20"><CheckCircle2 className="h-3 w-3 mr-1" />Harmonised</Badge>}
                    {uf.status === "error" && <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Error</Badge>}
                    {uf.status === "uploading" && <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Uploading</Badge>}
                    {uf.status === "processing" && <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />{uf.processingMessage || "Processing"}</Badge>}
                    <Button variant="ghost" size="icon" onClick={() => removeFile(uf.id)}><X className="h-4 w-4" /></Button>
                  </div>
                </div>
                {(uf.status === "uploading" || uf.status === "processing") && <Progress value={uf.progress} className="h-1.5 mt-2" />}
                {uf.status === "processing" && uf.processingMessage && (
                  <p className="text-xs text-muted-foreground mt-1 animate-pulse">{uf.processingMessage}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Source name</Label>
                    <Input placeholder="e.g. Amazon UK, Tesco" value={uf.sourceName} onChange={(e) => updateFile(uf.id, { sourceName: e.target.value })} disabled={uf.status !== "pending"} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Data type</Label>
                    <Select value={uf.sourceType} onValueChange={(v) => updateFile(uf.id, { sourceType: v })} disabled={uf.status !== "pending"}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="retailer">Sell-out (Retailer)</SelectItem>
                        <SelectItem value="ad_platform">Campaign (Ad Platform)</SelectItem>
                        <SelectItem value="dtc">DTC / Shopify</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {(uf.status === "processing" || uf.status === "done") && (
                  <div className="grid grid-cols-5 gap-2">
                    {uf.agents.map((agent, idx) => (
                      <div key={agent.agent} className={`flex flex-col items-center gap-1 p-2 rounded-lg text-center ${
                        agent.status === "running" ? "bg-primary/5 border border-primary/20" :
                        agent.status === "done" ? "bg-success/5 border border-success/20" :
                        "bg-muted border border-transparent"
                      }`}>
                        <agent.icon className={`h-4 w-4 ${
                          agent.status === "running" ? "text-primary animate-pulse" :
                          agent.status === "done" ? "text-success" : "text-muted-foreground"
                        }`} />
                        <span className="text-[10px] font-semibold">{agent.agent}</span>
                        <span className="text-[9px] text-muted-foreground leading-tight">{agent.label}</span>
                        <span className="text-[9px] font-medium">
                          {agent.status === "running" ? stageLabels[idx] : agent.status === "done" ? "Done ✓" : "Waiting"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {uf.columns && uf.preview && (
                  <div>
                    <p className="text-xs font-medium mb-2">Preview (first 5 rows)</p>
                    <div className="rounded-lg border overflow-auto max-h-40">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {uf.columns.map((col, i) => (<TableHead key={i} className="whitespace-nowrap text-xs py-2">{col}</TableHead>))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {uf.preview.map((row, ri) => (
                            <TableRow key={ri}>
                              {row.map((cell, ci) => (<TableCell key={ci} className="text-xs whitespace-nowrap py-1.5">{cell}</TableCell>))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {uf.error && <p className="text-sm text-destructive">{uf.error}</p>}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>

      {pendingCount > 0 && (
        <div className="flex justify-end">
          <Button onClick={uploadAll} size="lg">
            <Upload className="h-4 w-4 mr-2" />
            Upload & Harmonise {pendingCount} file{pendingCount !== 1 ? "s" : ""}
          </Button>
        </div>
      )}

      {/* Your Uploads */}
      <div>
        <h2 className="font-display text-lg font-bold mb-4">Your Uploads</h2>
        {loadingUploads ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground">Loading uploads...</CardContent></Card>
        ) : existingUploads.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Inbox className="h-10 w-10 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">No files uploaded yet. Drag and drop files above to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="rounded-lg overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">File</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Source</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Rows</TableHead>
                      <TableHead className="text-xs text-right">Size</TableHead>
                      <TableHead className="text-xs">Uploaded</TableHead>
                      <TableHead className="text-xs w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {existingUploads.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="text-sm font-medium">{u.file_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {u.source_type === "ad_platform" ? "Campaign" : u.source_type === "retailer" ? "Sell-out" : u.source_type ?? "Other"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{u.source_name ?? "—"}</TableCell>
                        <TableCell>
                          {u.status === "uploaded" && (
                            <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">uploaded</Badge>
                          )}
                          {u.status === "processing" && (
                            <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />processing
                            </Badge>
                          )}
                          {u.status === "ready" && (
                            <Badge className="bg-success/10 text-success border-success/20">
                              <CheckCircle2 className="h-3 w-3 mr-1" />ready
                            </Badge>
                          )}
                          {u.status === "error" && (
                            <Badge variant="destructive">
                              <AlertCircle className="h-3 w-3 mr-1" />error
                            </Badge>
                          )}
                          {!["uploaded", "processing", "ready", "error"].includes(u.status) && (
                            <Badge variant="outline">{u.status}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-right">{u.row_count ?? "—"}</TableCell>
                        <TableCell className="text-sm text-right text-muted-foreground">{(u.file_size / 1024).toFixed(1)} KB</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="flex items-center gap-1">
                          {(u.status === "processing" || u.status === "error") && (
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 text-primary/60 hover:text-primary"
                              disabled={retrying === u.id}
                              onClick={async () => {
                                setRetrying(u.id);
                                const { data: { session } } = await supabase.auth.getSession();
                                if (!session) { setRetrying(null); return; }
                                try {
                                  // Download from storage and reprocess inline
                                  const { data: blob, error: dlErr } = await supabase.storage.from("uploads").download(u.storage_path);
                                  if (dlErr || !blob) throw new Error("Failed to download: " + (dlErr?.message ?? "unknown"));
                                  await Promise.all([
                                    supabase.from("sell_out_data").delete().eq("upload_id", u.id),
                                    supabase.from("campaign_data_v2").delete().eq("upload_id", u.id),
                                    supabase.from("computed_metrics").delete().eq("user_id", session.user.id),
                                  ]);
                                  const result = await processInline(blob, u.file_name, u.id, session.user.id, u.source_name);
                                  toast({ title: "Reprocessed", description: `${u.file_name}: ${result.rowsInserted} rows inserted.` });
                                } catch (err: any) {
                                  toast({ title: "Retry failed", description: err.message, variant: "destructive" });
                                }
                                setRetrying(null);
                                fetchUploads();
                              }}
                            >
                              {retrying === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/60 hover:text-destructive" onClick={() => setDeleteTarget(u)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete upload?</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{deleteTarget?.file_name}</strong> from storage and remove all related sell-out and campaign data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UploadPage;
