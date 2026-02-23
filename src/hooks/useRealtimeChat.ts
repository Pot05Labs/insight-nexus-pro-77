import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type ChatMessage = {
  id: string;
  role: string;
  content: string;
  created_at: string | null;
  project_id: string | null;
};

export function useRealtimeChat(userId: string | undefined, projectId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const fetchMessages = async () => {
      let query = supabase
        .from("chat_messages")
        .select("id, role, content, created_at, project_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (projectId) query = query.eq("project_id", projectId);
      const { data } = await query;
      setMessages(data ?? []);
      setLoading(false);
    };
    fetchMessages();
  }, [userId, projectId]);

  useEffect(() => {
    if (!userId) return;

    const channel: RealtimeChannel = supabase
      .channel("realtime-chat")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => [...prev, newMsg]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, projectId]);

  return { messages, loading };
}
