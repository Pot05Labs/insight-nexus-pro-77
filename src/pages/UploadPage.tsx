import { useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileSpreadsheet, FileText, File as FileLucide, Presentation, FileJson, FileCode, X, CheckCircle2, AlertCircle, Loader2, Brain, Search, Calculator, PenTool, FileSearch, Trash2, Inbox, RotateCcw, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
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
import { generatePreview, getFileExtension, buildFileSchemaReport } from "@/services/clientFileProcessor";
import { orchestrateUpload, type UploadResult } from "@/services/uploadOrchestrator";
import { runLearningPipeline } from "@/services/learningPipeline";
import type { SchemaReport } from "@/lib/canonical-schemas";

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
  schemaReport?: SchemaReport;
  error?: string;
  processingMessage?: string;
  agents: ProcessingStage[];
  resultRowCount?: number;
  resultDataType?: string;
  resultWarning?: string;
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

const relativeTime = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
};

const UploadPage = () => {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [existingUploads, setExistingUploads] = useState<ExistingUpload[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ExistingUpload | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const fetchUploads = async () => {
    setLoadingUploads(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoadingUploads(false); return; }
    const { data } = await supabase
      .from("data_uploads")
      .select("id, file_name, file_type, file_size, source_name, source_type, status, created_at, row_count, storage_path")
      .eq("user_id", user.id)
      .neq("status", "archived")
      .order("created_at", { ascending: false });
    setExistingUploads(data ?? []);
    setLoadingUploads(false);
  };

  useEffect(() => { fetchUploads(); }, []);

  const fileTypeIcon = (fileName: string) => {
    const ext = getFileExtension(fileName);
    switch (ext) {
      case "csv": case "tsv": case "tab": return <FileSpreadsheet className="h-5 w-5 text-emerald-500" />;
      case "xlsx": case "xls": return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
      case "pptx": return <Presentation className="h-5 w-5 text-orange-500" />;
      case "pdf": return <FileText className="h-5 w-5 text-red-500" />;
      case "json": return <FileJson className="h-5 w-5 text-yellow-500" />;
      case "xml": return <FileCode className="h-5 w-5 text-blue-500" />;
      case "txt": return <FileText className="h-5 w-5 text-muted-foreground" />;
      default: return <FileLucide className="h-5 w-5 text-primary" />;
    }
  };

  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const accepted = Array.from(incoming);

    if (accepted.length === 0) {
      toast({ title: "No files selected", description: "Please select a file to upload.", variant: "destructive" });
      return;
    }

    // File size validation
    const oversized = accepted.filter((f) => f.size > MAX_FILE_SIZE);
    const validFiles = accepted.filter((f) => f.size <= MAX_FILE_SIZE);
    if (oversized.length > 0) {
      toast({
        title: "File too large",
        description: `${oversized.map((f) => f.name).join(", ")} exceeds 100 MB limit.`,
        variant: "destructive",
      });
    }
    if (validFiles.length === 0) return;

    const newFiles: UploadFile[] = validFiles.map((f) => ({
      file: f, id: crypto.randomUUID(), status: "pending" as const, progress: 0,
      sourceName: "", sourceType: "retailer", agents: createAgents(),
    }));

    if (newFiles.length === 0) {
      return;
    }

    // Generate previews sequentially to avoid concurrent memory spikes from large files
    const runPreviews = async () => {
      for (const uf of newFiles) {
        try {
          const { columns, preview, schemaReport: sr } = await generatePreview(uf.file);
          setFiles((prev) => prev.map((f) => (f.id === uf.id ? { ...f, columns, preview, schemaReport: sr } : f)));
        } catch (err: any) {
          console.warn(`Preview generation failed for ${uf.file.name}:`, err.message);
          // Don't block upload — just skip preview
        }
      }
    };
    runPreviews(); // non-blocking but sequential internally

    setFiles((prev) => [...prev, ...newFiles]);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));
  const updateFile = (id: string, updates: Partial<UploadFile>) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));

  const pollUploadStatus = async (fileId: string, uploadId: string, userId: string): Promise<void> => {
    let done = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 150; // 5 minutes at 2s intervals

    while (!done && attempts < MAX_ATTEMPTS) {
      await new Promise(r => setTimeout(r, 2000));
      attempts++;

      const { data: upload } = await supabase
        .from("data_uploads")
        .select("status, row_count, error_message, data_type, column_mapping")
        .eq("id", uploadId)
        .single();

      if (!upload) continue;

      // Update progress message
      const stageProgress: Record<string, number> = {
        "Parsing file...": 30,
        "Classifying columns...": 50,
        "Inserting data...": 65,
        "Computing metrics...": 85,
        "Done!": 100,
      };
      if (upload.status === "processing" && upload.error_message) {
        const pct = stageProgress[upload.error_message] ?? undefined;
        updateFile(fileId, {
          processingMessage: upload.error_message,
          ...(pct ? { progress: pct } : {}),
        });
      }

      if (upload.status === "ready") {
        done = true;
        const typeLabel = upload.data_type === "mixed" ? "Sell-out + Campaign"
          : upload.data_type === "campaign" ? "Campaign" : "Sell-out";

        // Detect partial failures from server error_message
        const hasPartialFailure = upload.error_message &&
          (upload.error_message.toLowerCase().includes("partial") ||
           upload.error_message.toLowerCase().includes("failed") ||
           upload.error_message.toLowerCase().includes("skipped"));

        setFiles(prev => prev.map(f =>
          f.id === fileId
            ? { ...f, agents: f.agents.map(a => ({ ...a, status: "done" as AgentStatus })) }
            : f
        ));

        updateFile(fileId, {
          status: "done",
          progress: 100,
          processingMessage: "Done!",
          resultRowCount: upload.row_count ?? 0,
          resultDataType: typeLabel,
          resultWarning: hasPartialFailure ? upload.error_message! : undefined,
        });
        toast({
          title: hasPartialFailure ? "File processed with warnings" : "File processed",
          description: hasPartialFailure
            ? `${upload.row_count ?? 0} rows inserted as ${typeLabel} data. ${upload.error_message}`
            : `${upload.row_count ?? 0} rows inserted as ${typeLabel} data.`,
        });

        // Invalidate dashboard caches so new data appears immediately
        queryClient.invalidateQueries({ queryKey: ["sell-out-data"] });
        queryClient.invalidateQueries({ queryKey: ["campaign-data"] });
        queryClient.invalidateQueries({ queryKey: ["computed-metrics"] });

        // Learning pipeline runs once after all uploads complete (in uploadAll)
      }

      if (upload.status === "error") {
        done = true;
        updateFile(fileId, {
          status: "error",
          error: upload.error_message || "Processing failed on server",
          processingMessage: undefined,
        });
      }
    }

    if (!done) {
      updateFile(fileId, {
        status: "error",
        error: "Processing timed out. Check upload history for status.",
        processingMessage: undefined,
      });
    }
  };

  const runProcessing = async (fileId: string, uploadId: string, file: File, sourceName: string | null, userId: string) => {
    updateFile(fileId, { status: "processing", progress: 5, processingMessage: "Starting..." });

    try {
      const result: UploadResult = await orchestrateUpload(
        file, uploadId, userId, sourceName,
        (progress) => {
          updateFile(fileId, {
            progress: Math.max(5, progress.percent),
            processingMessage: progress.stage,
          });
          // Advance agent indicators
          const stageIdx = progress.percent < 25 ? 0
            : progress.percent < 40 ? 1
            : progress.percent < 90 ? 2
            : 3;
          setFiles(prev => prev.map(f => {
            if (f.id !== fileId) return f;
            return {
              ...f,
              agents: f.agents.map((a, i) => ({
                ...a,
                status: i < stageIdx ? "done" as AgentStatus
                  : i === stageIdx ? "running" as AgentStatus
                  : "pending" as AgentStatus,
              })),
            };
          }));
        },
      );

      // Mark all agents as done
      setFiles(prev => prev.map(f =>
        f.id === fileId
          ? { ...f, agents: f.agents.map(a => ({ ...a, status: "done" as AgentStatus })) }
          : f
      ));

      if (result.success) {
        const { audit } = result;
        const typeLabel = result.dataType === "mixed" ? "Sell-out + Campaign"
          : result.dataType === "campaign" ? "Campaign" : "Sell-out";
        const hasFailures = audit.failedInserts > 0;
        updateFile(fileId, {
          status: "done",
          progress: 100,
          processingMessage: "Done!",
          resultRowCount: audit.successfulInserts,
          resultDataType: typeLabel,
          resultWarning: hasFailures
            ? `${audit.failedInserts} of ${audit.successfulInserts + audit.failedInserts} rows failed to insert.`
            : undefined,
        });
        let desc = `${audit.successfulInserts.toLocaleString()} rows inserted as ${typeLabel} data.`;
        if (hasFailures) desc += ` ${audit.failedInserts} rows failed.`;
        if (result.mapping.source === "llm") desc += " (AI-assisted mapping)";
        console.log(`[upload] Mapping used:`, result.mapping.fieldMap);
        console.log(`[upload] Unmapped columns:`, result.mapping.unmappedColumns);
        toast({ title: hasFailures ? "File processed with warnings" : "File processed", description: desc });
      } else {
        updateFile(fileId, {
          status: "error",
          error: result.error || "Processing failed",
          processingMessage: undefined,
        });
      }
    } catch (err: any) {
      updateFile(fileId, {
        status: "error",
        error: err.message || "Processing failed",
        processingMessage: undefined,
      });
    }
    // Invalidate React Query caches so dashboard/pages show new data
    queryClient.invalidateQueries({ queryKey: ["sell-out-data"] });
    queryClient.invalidateQueries({ queryKey: ["campaign-data"] });
    queryClient.invalidateQueries({ queryKey: ["computed-metrics"] });
    fetchUploads();
  };

  const uploadFile = async (uf: UploadFile) => {
    updateFile(uf.id, { status: "uploading", progress: 10 });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      updateFile(uf.id, { status: "error", error: "You must be logged in to upload files." });
      return;
    }

    // Check for duplicate upload — soft-delete old data if re-uploading same file
    const { data: existingDups } = await supabase
      .from("data_uploads")
      .select("id, file_name, created_at, row_count, storage_path")
      .eq("user_id", session.user.id)
      .eq("file_name", uf.file.name)
      .neq("status", "archived");

    if (existingDups && existingDups.length > 0) {
      toast({
        title: "Duplicate file detected",
        description: `${uf.file.name} was previously uploaded (${existingDups[0].row_count ?? 0} rows). The old data will be soft-deleted.`,
      });
      const now = new Date().toISOString();
      for (const dup of existingDups) {
        await supabase.from("sell_out_data")
          .update({ deleted_at: now })
          .eq("upload_id", dup.id)
          .is("deleted_at", null);
        await supabase.from("campaign_data_v2")
          .update({ deleted_at: now })
          .eq("upload_id", dup.id)
          .is("deleted_at", null);
        await supabase.from("data_uploads")
          .update({ status: "archived" })
          .eq("id", dup.id);
      }
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
    let failCount = 0;

    // Process files in concurrent waves of 3 for enterprise-speed uploads
    const UPLOAD_CONCURRENCY = 3;
    for (let w = 0; w < pending.length; w += UPLOAD_CONCURRENCY) {
      const wave = pending.slice(w, w + UPLOAD_CONCURRENCY);
      const results = await Promise.allSettled(wave.map(async (f) => {
        try {
          await uploadFile(f);
        } catch (err) {
          console.error(`[uploadAll] Failed to upload ${f.file.name}:`, err);
          updateFile(f.id, { status: "error", error: String(err) });
          throw err;
        }
      }));
      failCount += results.filter(r => r.status === "rejected").length;
    }

    // Run learning pipeline ONCE after all files are done (not per-file)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: projects } = await supabase
          .from("projects").select("id")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false }).limit(1);
        const pId = projects?.[0]?.id;
        if (pId) await runLearningPipeline(pId, session.user.id);
      }
    } catch (err) {
      console.warn("[uploadAll] Learning pipeline failed:", err);
    }

    const successCount = pending.length - failCount;
    const desc = failCount > 0
      ? `${successCount} file(s) uploaded successfully, ${failCount} failed.`
      : `${pending.length} file(s) uploaded.`;
    toast({
      title: failCount > 0 ? "Upload completed with errors" : "Processing complete",
      description: desc,
      variant: failCount > 0 ? "destructive" : undefined,
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    try {
      const now = new Date().toISOString();

      // Soft-delete related data rows
      const [soResult, cpResult] = await Promise.all([
        supabase.from("sell_out_data")
          .update({ deleted_at: now })
          .eq("upload_id", deleteTarget.id)
          .is("deleted_at", null),
        supabase.from("campaign_data_v2")
          .update({ deleted_at: now })
          .eq("upload_id", deleteTarget.id)
          .is("deleted_at", null),
      ]);

      if (soResult.error) {
        console.error("[UploadPage] sell_out_data soft-delete failed:", soResult.error.message);
        throw new Error(`Failed to soft-delete sell-out data: ${soResult.error.message}`);
      }
      if (cpResult.error) {
        console.error("[UploadPage] campaign_data_v2 soft-delete failed:", cpResult.error.message);
        throw new Error(`Failed to soft-delete campaign data: ${cpResult.error.message}`);
      }

      // Archive upload record (soft delete)
      await supabase.from("data_uploads")
        .update({ status: "archived" })
        .eq("id", deleteTarget.id);

      // Soft-delete stale computed_metrics so dashboard recomputes from surviving data
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: projects } = await supabase
          .from("projects").select("id").eq("user_id", user.id)
          .order("created_at", { ascending: false }).limit(1);
        const projectId = projects?.[0]?.id;
        if (projectId) {
          await supabase.from("computed_metrics")
            .update({ deleted_at: now })
            .eq("project_id", projectId)
            .is("deleted_at", null);
          // Re-run learning pipeline so AI memory reflects surviving data
          runLearningPipeline(projectId, user.id).catch((err) =>
            console.warn("[UploadPage] Post-delete learning pipeline failed:", err)
          );
        }
      }

      toast({ title: "File deleted", description: `${deleteTarget.file_name} and all related data removed.` });
      // Invalidate caches after deletion
      queryClient.invalidateQueries({ queryKey: ["sell-out-data"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-data"] });
      queryClient.invalidateQueries({ queryKey: ["computed-metrics"] });
    } catch (err) {
      console.error("[UploadPage] Delete failed:", err);
      toast({ title: "Delete failed", description: "Could not delete file. Please try again.", variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
      fetchUploads();
    }
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
        <p className="text-sm text-muted-foreground">Supports CSV, XLSX, PPTX, PDF, JSON, XML, TXT, and more</p>
        <div className="flex flex-wrap justify-center gap-1.5 mt-3">
          {["CSV", "XLSX", "PPTX", "PDF", "JSON", "TXT"].map((ext) => (
            <Badge key={ext} variant="outline" className="text-[10px] text-muted-foreground">
              {ext}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">Max 100 MB per file</p>
        <input id="file-input" type="file" className="hidden" multiple
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
                    {fileTypeIcon(uf.file.name)}
                    <div>
                      <CardTitle className="text-sm font-medium">{uf.file.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{(uf.file.size / 1024).toFixed(1)} KB · {getFileExtension(uf.file.name).toUpperCase()}</p>
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
                    <Input placeholder="e.g. Pick n Pay, Checkers" value={uf.sourceName} onChange={(e) => updateFile(uf.id, { sourceName: e.target.value })} disabled={uf.status !== "pending"} className="h-9 text-sm" />
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

                {uf.status === "done" && (
                  <div className="rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/50 dark:border-emerald-800/30 p-4 space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Upload Complete</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <p className="text-muted-foreground">Rows</p>
                        <p className="font-semibold">{uf.resultRowCount?.toLocaleString() ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Data Type</p>
                        <p className="font-semibold">{uf.resultDataType ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Mapping</p>
                        <p className="font-semibold">
                          {uf.schemaReport
                            ? uf.schemaReport.confidence === -1
                              ? "AI Extraction"
                              : `${uf.schemaReport.confidence}% match`
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">File Size</p>
                        <p className="font-semibold">{(uf.file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    {uf.resultWarning && (
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-md px-3 py-2 text-xs">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>{uf.resultWarning}</span>
                      </div>
                    )}
                    <Link to="/dashboard">
                      <Button size="sm" variant="outline" className="mt-2 text-xs">
                        <BarChart3 className="h-3 w-3 mr-1" />
                        View Dashboard
                      </Button>
                    </Link>
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

                {/* Schema Mapping Report */}
                {uf.schemaReport && (
                  <div className="space-y-2">
                    {uf.schemaReport.confidence === -1 ? (
                      /* PPTX / AI-extraction mode */
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium">Schema Mapping</p>
                        <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                          <Brain className="h-3 w-3 mr-1" />AI Extraction
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">Campaign</Badge>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium">Schema Mapping</p>
                          <Badge variant={uf.schemaReport.confidence >= 70 ? "default" : uf.schemaReport.confidence >= 40 ? "secondary" : "destructive"} className="text-[10px]">
                            {uf.schemaReport.confidence}% match
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {uf.schemaReport.dataType === "mixed" ? "Sell-out + Campaign" : uf.schemaReport.dataType === "campaign" ? "Campaign" : "Sell-out"}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {uf.schemaReport.mapped.map((m) => (
                            <Badge key={m.canonical} variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                              {m.canonical} → {m.sourceColumn}
                            </Badge>
                          ))}
                          {uf.schemaReport.unmapped.filter((u) => u.required).map((u) => (
                            <Badge key={u.canonical} variant="outline" className="text-[9px] bg-amber-500/10 text-amber-700 border-amber-500/20">
                              {u.canonical} — not found
                            </Badge>
                          ))}
                          {uf.schemaReport.unmappedSource.slice(0, 5).map((col) => (
                            <Badge key={col} variant="outline" className="text-[9px] bg-muted text-muted-foreground">
                              {col}
                            </Badge>
                          ))}
                          {uf.schemaReport.unmappedSource.length > 5 && (
                            <Badge variant="outline" className="text-[9px] bg-muted text-muted-foreground">
                              +{uf.schemaReport.unmappedSource.length - 5} more
                            </Badge>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {uf.status === "error" && uf.error && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                    <p className="text-sm font-medium text-destructive">{uf.error}</p>
                    <p className="text-xs text-muted-foreground">
                      {uf.error.includes("column") || uf.error.includes("Column")
                        ? "Tip: Ensure your file has columns for date, revenue/sales, and product/SKU."
                        : uf.error.includes("timeout") || uf.error.includes("Timeout")
                        ? "Tip: Large files may take longer. Try splitting into smaller files."
                        : uf.error.includes("parse") || uf.error.includes("Parse")
                        ? "Tip: Check that your file isn't password-protected or corrupted."
                        : "Tip: Try re-uploading the file. If the issue persists, check the file format."}
                    </p>
                  </div>
                )}
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
                        <TableCell className="text-sm font-medium">
                          <div className="flex items-center gap-2">
                            {fileTypeIcon(u.file_name)}
                            <span>{u.file_name}</span>
                          </div>
                        </TableCell>
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
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{relativeTime(u.created_at)}</TableCell>
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
                                  // Soft-delete old data before reprocessing
                                  const retryNow = new Date().toISOString();
                                  const [soR, cpR] = await Promise.all([
                                    supabase.from("sell_out_data")
                                      .update({ deleted_at: retryNow })
                                      .eq("upload_id", u.id)
                                      .is("deleted_at", null),
                                    supabase.from("campaign_data_v2")
                                      .update({ deleted_at: retryNow })
                                      .eq("upload_id", u.id)
                                      .is("deleted_at", null),
                                  ]);
                                  if (soR.error) throw new Error(soR.error.message);
                                  if (cpR.error) throw new Error(cpR.error.message);
                                  // Reprocess via edge function
                                  supabase.functions.invoke("process-upload", { body: { uploadId: u.id } }).catch(console.error);
                                  await pollUploadStatus(u.id, u.id, session.user.id);
                                  toast({ title: "Reprocessed", description: "File has been reprocessed." });
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
                    <TableRow className="bg-muted/30 font-medium">
                      <TableCell colSpan={4} className="text-xs">Total: {existingUploads.length} files</TableCell>
                      <TableCell className="text-xs text-right">{existingUploads.reduce((s, u) => s + (u.row_count ?? 0), 0).toLocaleString()}</TableCell>
                      <TableCell colSpan={3}></TableCell>
                    </TableRow>
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
