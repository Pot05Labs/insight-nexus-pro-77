/**
 * OrgContext — Organization / workspace context for multi-tenancy
 *
 * Provides the current active organization, member role, and org-switching
 * functionality. When no org is selected, the app falls back to personal
 * user_id scoping (backward compatible).
 *
 * Usage:
 *   const { currentOrg, orgs, switchOrg, role } = useOrg();
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type OrgRole = "owner" | "admin" | "analyst" | "viewer";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: string;
  role: OrgRole;
}

interface OrgContextValue {
  /** Currently active organization, or null for personal workspace */
  currentOrg: Organization | null;
  /** All organizations the user belongs to */
  orgs: Organization[];
  /** Switch to a different organization (pass null for personal) */
  switchOrg: (orgId: string | null) => void;
  /** User's role in the current org */
  role: OrgRole | null;
  /** Whether user has admin+ privileges in current org */
  isAdmin: boolean;
  /** Whether the org list is still loading */
  loading: boolean;
  /** Force refresh the org list */
  refresh: () => Promise<void>;
}

const OrgContext = createContext<OrgContextValue>({
  currentOrg: null,
  orgs: [],
  switchOrg: () => {},
  role: null,
  isAdmin: false,
  loading: true,
  refresh: async () => {},
});

/* ------------------------------------------------------------------ */
/*  Storage key for persisting last-used org                            */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "signalstack_active_org";

/* ------------------------------------------------------------------ */
/*  Provider                                                            */
/* ------------------------------------------------------------------ */

export function OrgProvider({ children }: { children: ReactNode }) {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrgs = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setOrgs([]);
        setCurrentOrg(null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("org-management", {
        body: { action: "list_orgs" },
      });

      if (error || !data?.orgs) {
        // No orgs or function not deployed yet — that's fine, personal mode
        setOrgs([]);
        setCurrentOrg(null);
        setLoading(false);
        return;
      }

      const orgList: Organization[] = data.orgs;
      setOrgs(orgList);

      // Restore last-used org from localStorage
      const savedOrgId = localStorage.getItem(STORAGE_KEY);
      const savedOrg = savedOrgId ? orgList.find((o) => o.id === savedOrgId) : null;

      if (savedOrg) {
        setCurrentOrg(savedOrg);
      } else if (orgList.length === 1) {
        // Auto-select if user only has one org
        setCurrentOrg(orgList[0]);
        localStorage.setItem(STORAGE_KEY, orgList[0].id);
      }
      // else: stay in personal mode (currentOrg = null)
    } catch {
      // Silently fail — org features may not be deployed yet
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  // Re-fetch when auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        fetchOrgs();
      } else {
        setOrgs([]);
        setCurrentOrg(null);
      }
    });
    return () => subscription.unsubscribe();
  }, [fetchOrgs]);

  const switchOrg = useCallback(
    (orgId: string | null) => {
      if (orgId === null) {
        setCurrentOrg(null);
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const org = orgs.find((o) => o.id === orgId);
      if (org) {
        setCurrentOrg(org);
        localStorage.setItem(STORAGE_KEY, orgId);
      }
    },
    [orgs],
  );

  const role = currentOrg?.role ?? null;
  const isAdmin = role === "owner" || role === "admin";

  return (
    <OrgContext.Provider value={{ currentOrg, orgs, switchOrg, role, isAdmin, loading, refresh: fetchOrgs }}>
      {children}
    </OrgContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Hook                                                                */
/* ------------------------------------------------------------------ */

export function useOrg() {
  return useContext(OrgContext);
}
