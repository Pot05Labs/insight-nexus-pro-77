import { supabase } from "@/integrations/supabase/client";

export type ProjectContext = {
  userId: string;
  projectId: string;
};

export async function getCurrentProjectContext(): Promise<ProjectContext | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  const projectId = projects?.[0]?.id;
  if (!projectId) return null;

  return { userId: user.id, projectId };
}
