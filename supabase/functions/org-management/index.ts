import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createLogger, generateRequestId } from "../_shared/logger.ts";

/**
 * Organization Management Edge Function
 *
 * Handles CRUD operations for organizations, members, and invitations.
 *
 * POST /functions/v1/org-management
 * Body: { action, ...params }
 *
 * Actions:
 *   create_org       — Create a new organization
 *   get_org           — Get org details
 *   update_org        — Update org name/settings
 *   list_orgs         — List user's organizations
 *   invite_member     — Send invitation
 *   accept_invitation — Accept invitation by token
 *   list_members      — List org members
 *   update_member     — Update member role
 *   remove_member     — Remove member from org
 *   list_invitations  — List pending invitations for org
 *   revoke_invitation — Cancel a pending invitation
 */

Deno.serve(async (req) => {
  const preflightResp = handleCors(req);
  if (preflightResp) return preflightResp;

  const requestId = generateRequestId();
  const log = createLogger("org-management", requestId);

  try {
    // Auth
    const auth = await authenticateRequest(req);
    if (!auth) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const { userId } = auth;
    const body = await req.json();
    const { action } = body;

    // Service-role client for admin operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const respond = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });

    const errorResp = (message: string, status = 400) =>
      respond({ error: message }, status);

    // ── Helper: check if user has admin+ role in org ──
    const isAdminOf = async (orgId: string): Promise<boolean> => {
      const { data } = await supabase
        .from("org_members")
        .select("role")
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .single();
      return data?.role === "owner" || data?.role === "admin";
    };

    // ── Helper: check if user is member of org ──
    const isMemberOf = async (orgId: string): Promise<boolean> => {
      const { data } = await supabase
        .from("org_members")
        .select("id")
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .single();
      return !!data;
    };

    log.info(`Action: ${action}`, { userId });

    switch (action) {

      /* ──────────────────────────────────────────────── */
      /*  create_org                                       */
      /* ──────────────────────────────────────────────── */
      case "create_org": {
        const { name, slug } = body;
        if (!name || !slug) return errorResp("name and slug are required");

        // Validate slug format
        if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug)) {
          return errorResp("slug must be 3-50 lowercase alphanumeric characters with hyphens");
        }

        // Check slug uniqueness
        const { data: existing } = await supabase
          .from("organizations")
          .select("id")
          .eq("slug", slug)
          .single();
        if (existing) return errorResp("This slug is already taken");

        const { data: org, error } = await supabase
          .from("organizations")
          .insert({ name, slug, owner_id: userId })
          .select()
          .single();

        if (error) {
          log.error("Failed to create org", { error: error.message });
          return errorResp(error.message, 500);
        }

        // Trigger auto-creates owner membership
        log.info("Org created", { orgId: org.id, slug });
        return respond({ org });
      }

      /* ──────────────────────────────────────────────── */
      /*  get_org                                          */
      /* ──────────────────────────────────────────────── */
      case "get_org": {
        const { orgId } = body;
        if (!orgId) return errorResp("orgId is required");

        if (!(await isMemberOf(orgId))) return errorResp("Not a member of this organization", 403);

        const { data: org, error } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", orgId)
          .single();

        if (error || !org) return errorResp("Organization not found", 404);
        return respond({ org });
      }

      /* ──────────────────────────────────────────────── */
      /*  update_org                                       */
      /* ──────────────────────────────────────────────── */
      case "update_org": {
        const { orgId, name, settings } = body;
        if (!orgId) return errorResp("orgId is required");

        if (!(await isAdminOf(orgId))) return errorResp("Admin access required", 403);

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (name) updates.name = name;
        if (settings) updates.settings = settings;

        const { data: org, error } = await supabase
          .from("organizations")
          .update(updates)
          .eq("id", orgId)
          .select()
          .single();

        if (error) return errorResp(error.message, 500);
        return respond({ org });
      }

      /* ──────────────────────────────────────────────── */
      /*  list_orgs                                        */
      /* ──────────────────────────────────────────────── */
      case "list_orgs": {
        const { data: memberships, error } = await supabase
          .from("org_members")
          .select("org_id, role, organizations(id, name, slug, logo_url, plan)")
          .eq("user_id", userId);

        if (error) return errorResp(error.message, 500);

        const orgs = (memberships ?? []).map((m: Record<string, unknown>) => ({
          ...(m.organizations as Record<string, unknown>),
          role: m.role,
        }));

        return respond({ orgs });
      }

      /* ──────────────────────────────────────────────── */
      /*  invite_member                                    */
      /* ──────────────────────────────────────────────── */
      case "invite_member": {
        const { orgId, email, role } = body;
        if (!orgId || !email) return errorResp("orgId and email are required");

        if (!(await isAdminOf(orgId))) return errorResp("Admin access required", 403);

        // Check member limit
        const { count: memberCount } = await supabase
          .from("org_members")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId);

        const { data: org } = await supabase
          .from("organizations")
          .select("max_members")
          .eq("id", orgId)
          .single();

        if (org && memberCount !== null && memberCount >= org.max_members) {
          return errorResp(`Organization has reached its member limit (${org.max_members})`);
        }

        // Check if user is already a member
        const { data: existingUser } = await supabase
          .from("auth.users")
          .select("id")
          .eq("email", email)
          .single();

        // Note: auth.users query may fail with RLS — fall back to checking org_members
        // Just check if there's already a pending invitation
        const { data: existingInvite } = await supabase
          .from("org_invitations")
          .select("id")
          .eq("org_id", orgId)
          .eq("email", email)
          .is("accepted_at", null)
          .single();

        if (existingInvite) {
          return errorResp("An invitation is already pending for this email");
        }

        const validRoles = ["admin", "analyst", "viewer"];
        const memberRole = validRoles.includes(role) ? role : "viewer";

        const { data: invitation, error } = await supabase
          .from("org_invitations")
          .insert({
            org_id: orgId,
            email,
            role: memberRole,
            invited_by: userId,
          })
          .select()
          .single();

        if (error) return errorResp(error.message, 500);

        log.info("Invitation sent", { orgId, email, role: memberRole });
        // TODO: Send invitation email via Resend/Postmark
        return respond({ invitation });
      }

      /* ──────────────────────────────────────────────── */
      /*  accept_invitation                                */
      /* ──────────────────────────────────────────────── */
      case "accept_invitation": {
        const { token } = body;
        if (!token) return errorResp("token is required");

        // Look up the invitation
        const { data: invitation, error: invErr } = await supabase
          .from("org_invitations")
          .select("*")
          .eq("token", token)
          .is("accepted_at", null)
          .single();

        if (invErr || !invitation) return errorResp("Invalid or expired invitation", 404);

        // Check expiry
        if (new Date(invitation.expires_at) < new Date()) {
          return errorResp("Invitation has expired");
        }

        // Verify email matches current user
        const { data: { user } } = await createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
        ).auth.getUser();

        if (!user || user.email !== invitation.email) {
          return errorResp("Invitation email does not match your account", 403);
        }

        // Check if already a member
        const alreadyMember = await isMemberOf(invitation.org_id);
        if (alreadyMember) {
          // Mark invitation as accepted anyway
          await supabase.from("org_invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invitation.id);
          return respond({ message: "Already a member of this organization" });
        }

        // Add member
        const { error: memberErr } = await supabase
          .from("org_members")
          .insert({
            org_id: invitation.org_id,
            user_id: userId,
            role: invitation.role,
            invited_by: invitation.invited_by,
          });

        if (memberErr) return errorResp(memberErr.message, 500);

        // Mark invitation as accepted
        await supabase.from("org_invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invitation.id);

        log.info("Invitation accepted", { orgId: invitation.org_id, userId });
        return respond({ message: "Invitation accepted" });
      }

      /* ──────────────────────────────────────────────── */
      /*  list_members                                     */
      /* ──────────────────────────────────────────────── */
      case "list_members": {
        const { orgId } = body;
        if (!orgId) return errorResp("orgId is required");

        if (!(await isMemberOf(orgId))) return errorResp("Not a member", 403);

        const { data: members, error } = await supabase
          .from("org_members")
          .select("id, user_id, role, created_at, profiles(full_name, avatar_url)")
          .eq("org_id", orgId)
          .order("created_at", { ascending: true });

        if (error) return errorResp(error.message, 500);
        return respond({ members });
      }

      /* ──────────────────────────────────────────────── */
      /*  update_member                                    */
      /* ──────────────────────────────────────────────── */
      case "update_member": {
        const { orgId, memberId, role } = body;
        if (!orgId || !memberId || !role) return errorResp("orgId, memberId, and role are required");

        if (!(await isAdminOf(orgId))) return errorResp("Admin access required", 403);

        // Cannot change owner role
        const { data: targetMember } = await supabase
          .from("org_members")
          .select("role, user_id")
          .eq("id", memberId)
          .eq("org_id", orgId)
          .single();

        if (!targetMember) return errorResp("Member not found", 404);
        if (targetMember.role === "owner") return errorResp("Cannot change owner role");

        const validRoles = ["admin", "analyst", "viewer"];
        if (!validRoles.includes(role)) return errorResp("Invalid role");

        const { error } = await supabase
          .from("org_members")
          .update({ role, updated_at: new Date().toISOString() })
          .eq("id", memberId)
          .eq("org_id", orgId);

        if (error) return errorResp(error.message, 500);
        return respond({ message: "Member role updated" });
      }

      /* ──────────────────────────────────────────────── */
      /*  remove_member                                    */
      /* ──────────────────────────────────────────────── */
      case "remove_member": {
        const { orgId, memberId } = body;
        if (!orgId || !memberId) return errorResp("orgId and memberId are required");

        // Check if removing self or is admin
        const { data: targetMember } = await supabase
          .from("org_members")
          .select("user_id, role")
          .eq("id", memberId)
          .eq("org_id", orgId)
          .single();

        if (!targetMember) return errorResp("Member not found", 404);
        if (targetMember.role === "owner") return errorResp("Cannot remove the organization owner");

        const isSelf = targetMember.user_id === userId;
        const isAdmin = await isAdminOf(orgId);

        if (!isSelf && !isAdmin) return errorResp("Admin access required", 403);

        const { error } = await supabase
          .from("org_members")
          .delete()
          .eq("id", memberId)
          .eq("org_id", orgId);

        if (error) return errorResp(error.message, 500);
        log.info("Member removed", { orgId, memberId });
        return respond({ message: "Member removed" });
      }

      /* ──────────────────────────────────────────────── */
      /*  list_invitations                                 */
      /* ──────────────────────────────────────────────── */
      case "list_invitations": {
        const { orgId } = body;
        if (!orgId) return errorResp("orgId is required");

        if (!(await isAdminOf(orgId))) return errorResp("Admin access required", 403);

        const { data: invitations, error } = await supabase
          .from("org_invitations")
          .select("*")
          .eq("org_id", orgId)
          .is("accepted_at", null)
          .order("created_at", { ascending: false });

        if (error) return errorResp(error.message, 500);
        return respond({ invitations });
      }

      /* ──────────────────────────────────────────────── */
      /*  revoke_invitation                                */
      /* ──────────────────────────────────────────────── */
      case "revoke_invitation": {
        const { orgId, invitationId } = body;
        if (!orgId || !invitationId) return errorResp("orgId and invitationId are required");

        if (!(await isAdminOf(orgId))) return errorResp("Admin access required", 403);

        const { error } = await supabase
          .from("org_invitations")
          .delete()
          .eq("id", invitationId)
          .eq("org_id", orgId);

        if (error) return errorResp(error.message, 500);
        return respond({ message: "Invitation revoked" });
      }

      default:
        return errorResp(`Unknown action: ${action}`);
    }
  } catch (err) {
    log.error("Unhandled error", { error: String(err) });
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});
