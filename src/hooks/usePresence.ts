import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PresenceUser = {
  userId: string;
  email: string;
  fullName: string | null;
  onlineAt: string;
};

export function usePresence(userId: string | undefined, email: string | undefined, fullName: string | null | undefined) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!userId || !email) return;

    const channel = supabase.channel("online-users", {
      config: { presence: { key: userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceUser>();
        const users: PresenceUser[] = [];
        Object.values(state).forEach((presences) => {
          presences.forEach((p) => {
            users.push({
              userId: p.userId,
              email: p.email,
              fullName: p.fullName,
              onlineAt: p.onlineAt,
            });
          });
        });
        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            userId,
            email,
            fullName: fullName ?? null,
            onlineAt: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, email, fullName]);

  return { onlineUsers };
}
