import { supabase } from "@/integrations/supabase/client";

export type Msg = { role: "user" | "assistant"; content: string };

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const CHAT_URL = `${SUPABASE_URL}/functions/v1/ai-chat`;

export async function streamAiChat({
  messages,
  context,
  onDelta,
  onDone,
  onError,
}: {
  messages: Msg[];
  context: string;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  // Get user session for authenticated Edge Function calls
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    onError("Not logged in. Please sign in to use AI features.");
    return;
  }

  // Add a timeout controller (120s — auto-routing may queue briefly)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  try {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0aWtoYXVocHdwaHljZW9pc21lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NTYwNDUsImV4cCI6MjA4NzAzMjA0NX0.l0JtKLPc0KKMqlT7RRqLOgSboE9mqawNk0WYFmT1tT8",
      },
      body: JSON.stringify({ messages, context }),
      signal: controller.signal,
    });

    if (!resp.ok || !resp.body) {
      // Try to extract the error message from the Edge Function response
      let errorMsg = `AI request failed (${resp.status})`;
      try {
        const errBody = await resp.json();
        if (errBody.error) errorMsg = errBody.error;
      } catch {
        // Response wasn't JSON, use status-based message
        if (resp.status === 429) errorMsg = "Rate limited — please wait a moment and try again.";
        else if (resp.status === 402) errorMsg = "OpenRouter credits exhausted. Top up at openrouter.ai.";
        else if (resp.status === 401) errorMsg = "API key invalid. Check OPENROUTER secret in Supabase.";
        else if (resp.status === 503) errorMsg = "AI service temporarily unavailable. Please try again.";
      }
      console.error(`[aiChatStream] Error ${resp.status}:`, errorMsg);
      onError(errorMsg);
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let done = false;
    let receivedContent = false;

    while (!done) {
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
        if (json === "[DONE]") { done = true; break; }
        try {
          const parsed = JSON.parse(json);
          // Detect error objects sent within the SSE stream
          if (parsed.error) {
            const errMsg = typeof parsed.error === "string"
              ? parsed.error
              : parsed.error.message ?? JSON.stringify(parsed.error);
            console.error("[aiChatStream] Error in SSE stream:", errMsg);
            onError(errMsg);
            return;
          }
          const c = parsed.choices?.[0]?.delta?.content;
          if (c) { onDelta(c); receivedContent = true; }
        } catch {
          buf = line + "\n" + buf;
          break;
        }
      }
    }

    if (!receivedContent) {
      onError("AI returned an empty response. Please try again.");
      return;
    }

    onDone();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      onError("Response timed out. Please try again.");
    } else if (err instanceof TypeError && (err.message === "Failed to fetch" || err.message === "NetworkError when attempting to fetch resource.")) {
      console.error("[aiChatStream] Network error — Edge Function unreachable:", err);
      onError("Cannot reach AI service. The Edge Function may not be deployed. Run: supabase functions deploy ai-chat");
    } else {
      onError("Something went wrong. Please try again.");
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
