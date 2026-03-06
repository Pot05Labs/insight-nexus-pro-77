/* ------------------------------------------------------------------ */
/*  Audit Client — typed audit trail for SignalStack                  */
/*  Logs user actions to activity_log with compile-time safety        */
/* ------------------------------------------------------------------ */

import { supabase } from "@/integrations/supabase/client";

/**
 * All auditable actions in SignalStack.
 * Adding a new action here enforces type-checking at every call site.
 */
export type AuditAction =
  // Auth
  | "auth.login"
  | "auth.logout"
  | "auth.signup"
  // Data
  | "data.upload_start"
  | "data.upload_complete"
  | "data.upload_fail"
  | "data.delete"
  // AI
  | "ai.query"
  | "ai.query_fail"
  | "ai.insights_generate"
  | "ai.report_generate"
  // Dashboard
  | "dashboard.view"
  | "dashboard.export"
  | "dashboard.filter_change"
  // Project
  | "project.create"
  | "project.switch"
  | "project.delete"
  // Billing
  | "billing.checkout_start"
  | "billing.subscription_change"
  // Admin
  | "admin.settings_change";

type AuditPayload = {
  action: AuditAction;
  meta?: Record<string, unknown>;
  resourceId?: string;
  resourceType?: string;
};

/**
 * Log an audit event to the activity_log table.
 * Fire-and-forget — never blocks the UI or throws errors.
 */
export async function audit({ action, meta, resourceId, resourceType }: AuditPayload): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return; // Not authenticated — skip silently

    await supabase.from("activity_log").insert({
      user_id: session.user.id,
      action,
      metadata: meta ?? null,
      resource_id: resourceId ?? null,
      resource_type: resourceType ?? null,
    });
  } catch {
    // Audit logging must never break the user experience
    console.warn(`[audit] Failed to log: ${action}`);
  }
}
