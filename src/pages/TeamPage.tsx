import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Users, Mail, Shield } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const TeamPage = () => {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [inviting, setInviting] = useState(false);
  const { toast } = useToast();

  // For now, show a placeholder team list since multi-tenant is future work
  const { data: currentRole } = useQuery({
    queryKey: ["myRole"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id);
      return data?.[0]?.role ?? null;
    },
  });

  const handleInvite = async () => {
    if (!email) return;
    setInviting(true);
    // Placeholder: In production this would send an invite email via edge function
    await new Promise((r) => setTimeout(r, 1000));
    toast({
      title: "Invite sent",
      description: `Invitation sent to ${email} as ${role}.`,
    });
    setEmail("");
    setInviting(false);
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-bold">Team</h1>
        <p className="text-muted-foreground text-sm">Invite and manage your team members.</p>
      </div>

      {currentRole === "admin" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              <CardTitle className="font-display text-lg">Invite a team member</CardTitle>
            </div>
            <CardDescription>Send an invitation by email</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1 space-y-2">
                <Label>Email address</Label>
                <Input
                  type="email"
                  placeholder="colleague@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="w-36 space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="analyst">Analyst</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleInvite} disabled={inviting || !email}>
              <Mail className="h-4 w-4 mr-2" />
              {inviting ? "Sending..." : "Send invite"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle className="font-display text-lg">Team members</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">You</p>
                  <p className="text-xs text-muted-foreground">Account owner</p>
                </div>
              </div>
              <Badge className="capitalize">{currentRole || "—"}</Badge>
            </div>
            <p className="text-sm text-muted-foreground text-center py-4">
              Invite team members to start collaborating.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamPage;
