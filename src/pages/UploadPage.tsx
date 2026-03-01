import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileSpreadsheet, FileText, File as FileLucide, Presentation, FileJson, FileCode, X, CheckCircle2, AlertCircle, Loader2, Brain, Search, Calculator, PenTool, FileSearch, Trash2, Inbox, RotateCcw } from "lucide-react";
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
import { generatePreview, processFileClientSide, reprocessFromStorage, getFileExtension, buildFileSchemaReport } from "@/services/clientFileProcessor";
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

    // Generate previews + schema reports for ALL file types
    newFiles.forEach((uf) => {
      generatePreview(uf.file)
        .then(({ columns, preview, schemaReport: sr }) => {
          setFiles((prev) => prev.map((f) => (f.id === uf.id ? { ...f, columns, preview, schemaReport: sr } : f)));
        })
        .catch((err) => {
          console.warn(`Preview generation failed for ${uf.file.name}:`, err.message);
          // Don't block upload — just skip preview
        });
    });

    setFiles((prev) => [...prev, ...newFiles]);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));
  const updateFile = (id: string, updates: Partial<UploadFile>) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));

  const runProcessing = async (fileId: string, uploadId: string, file: File, sourceName: string | null, userId: string) => {
    updateFile(fileId, { status: "processing", progress: 20, processingMessage: "Parsing file..." });
    try {
      const result = await processFileClientSide(file, uploadId, userId, sourceName, (p) => {
        updateFile(fileId, {
          progress: Math.max(20, p.percent),
          processingMessage: p.stage,
        });
        // Advance agent indicators based on stage index
        setFiles((prev) =>
          prev.map((f) => {
            if (f.id !== fileId) return f;
            return {
              ...f,
              agents: f.agents.map((a, i) => ({
                ...a,
                status: i < p.stageIndex ? "done" as AgentStatus
                  : i === p.stageIndex ? "running" as AgentStatus
                  : "pending" as AgentStatus,
              })),
            };
          })
        );
      });

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
        const typeLabel = result.detectedType === "mixed" ? "Sell-out + Campaign" : result.detectedType === "campaign" ? "Campaign" : "Sell-out";
        toast({ title: "File processed", description: `${result.rowsInserted} rows inserted as ${typeLabel} data.` });

        // Trigger learning pipeline (non-blocking)
        const { data: projects } = await supabase.from("projects").select("id").limit(1);
        const pId = projects?.[0]?.id;
        if (pId) runLearningPipeline(pId, userId).catch(() => {});
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

    try {
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

      toast({ title: "File deleted", description: `${deleteTarget.file_name} and related data removed.` });
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

                {/* Schema Mapping Report */}
                {uf.schemaReport && (
                  <div className="space-y-2">
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
                                  const result = await reprocessFromStorage(u.id, u.storage_path, u.file_name, session.user.id, u.source_name);
                                  toast({ title: "Reprocessed", description: `${u.file_name}: ${result.rowsInserted} rows inserted as ${result.detectedType === "campaign" ? "Campaign" : "Sell-out"} data.` });
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
