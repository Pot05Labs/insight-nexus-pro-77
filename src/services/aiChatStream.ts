export type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

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
  // Add a timeout controller (60s for AI responses)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages, context }),
      signal: controller.signal,
    });

    if (resp.status === 429) { onError("Rate limited — please wait a moment and try again."); return; }
    if (resp.status === 402 || resp.status === 401) { onError("API key issue. Please check configuration."); return; }
    if (!resp.ok || !resp.body) { onError("Failed to connect to AI."); return; }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let done = false;

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
          const c = parsed.choices?.[0]?.delta?.content;
          if (c) onDelta(c);
        } catch {
          buf = line + "\n" + buf;
          break;
        }
      }
    }
    onDone();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      onError("Response timed out. Please try again.");
    } else {
      onError("Something went wrong. Please try again.");
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
