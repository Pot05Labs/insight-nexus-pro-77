import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const TeamPage = () => {
  const { data: currentUser } = useQuery({
    queryKey: ["currentProfile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .single();
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      return {
        email: user.email ?? "",
        name: profile?.full_name ?? user.email?.split("@")[0] ?? "You",
        role: roleData?.[0]?.role ?? "owner",
      };
    },
  });

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-bold">Team</h1>
        <p className="text-muted-foreground text-sm">Manage your SignalStack workspace members.</p>
      </div>

      {/* Coming Soon Banner */}
      <Card className="border-amber-200 dark:border-amber-800/30 bg-amber-50/50 dark:bg-amber-950/10">
        <CardContent className="p-4 flex items-center gap-3">
          <Users className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-medium">Team invitations coming soon</p>
            <p className="text-xs text-muted-foreground">Multi-user collaboration is on our roadmap. Currently, each workspace supports one user.</p>
          </div>
        </CardContent>
      </Card>

      {/* Current User */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="font-display text-lg">Workspace Members</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 rounded-lg border border-border">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{currentUser?.name ?? "Loading..."}</p>
                <p className="text-xs text-muted-foreground">{currentUser?.email ?? ""}</p>
              </div>
            </div>
            <Badge className="capitalize">{currentUser?.role ?? "owner"}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamPage;
