/* ------------------------------------------------------------------ */
/*  Structured JSON logger for SignalStack Edge Functions              */
/*  All log lines are JSON → parseable by Supabase log explorer       */
/* ------------------------------------------------------------------ */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogEntry = {
  level: LogLevel;
  fn: string;           // Edge Function name (e.g., "ai-chat", "process-upload")
  msg: string;          // Human-readable message
  requestId?: string;   // Unique request ID for tracing
  userId?: string;      // Authenticated user (PII-safe: just UUID)
  durationMs?: number;  // Request duration
  meta?: Record<string, unknown>; // Arbitrary structured data
};

function emit(entry: LogEntry) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...entry,
  });

  switch (entry.level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}

/**
 * Create a logger scoped to a specific Edge Function.
 *
 * Usage:
 * ```ts
 * const log = createLogger("ai-chat", requestId);
 * log.info("Processing request", { model: "llama-70b" });
 * log.error("OpenRouter failed", { status: 503 });
 * ```
 */
export function createLogger(fn: string, requestId?: string) {
  const base = { fn, requestId };

  return {
    debug: (msg: string, meta?: Record<string, unknown>) =>
      emit({ ...base, level: "debug", msg, meta }),
    info: (msg: string, meta?: Record<string, unknown>) =>
      emit({ ...base, level: "info", msg, meta }),
    warn: (msg: string, meta?: Record<string, unknown>) =>
      emit({ ...base, level: "warn", msg, meta }),
    error: (msg: string, meta?: Record<string, unknown>) =>
      emit({ ...base, level: "error", msg, meta }),
    /** Set userId after authentication succeeds */
    withUser(userId: string) {
      return createLogger(fn, requestId);
    },
  };
}

/** Generate a short random request ID for tracing */
export function generateRequestId(): string {
  return crypto.randomUUID().slice(0, 8);
}
