import { useState, useEffect } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Upload,
  LayoutDashboard,
  Package,
  Store,
  MapPin,
  Users,
  Megaphone,
  Zap,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Settings,
  LogOut,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeCounts } from "@/hooks/useRealtimeCounts";
import { usePresence, type PresenceUser } from "@/hooks/usePresence";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import NotificationBell from "@/components/NotificationBell";

const navItems = [
  { to: "/upload", icon: Upload, label: "Upload Hub", badgeKey: "pendingUploads" as const },
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", badgeKey: "newDataCount" as const },
  { to: "/products", icon: Package, label: "Products" },
  { to: "/retailers", icon: Store, label: "Retailers" },
  { to: "/geography", icon: MapPin, label: "Geography" },
  { to: "/behaviour", icon: Users, label: "Behaviour" },
  { to: "/campaigns", icon: Megaphone, label: "Campaigns" },
  { to: "/insights", icon: Zap, label: "AI Insights" },
  { to: "/query", icon: MessageSquare, label: "Query" },
  { to: "/billing", icon: CreditCard, label: "Billing" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const DashboardLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<{ full_name: string | null; role: string }>({ full_name: null, role: "" });

  const { pendingUploads, newDataCount } = useRealtimeCounts(user?.id);
  const { onlineUsers } = usePresence(user?.id, user?.email, profile.full_name);

  const badgeCounts = { pendingUploads, newDataCount };

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const [profileRes, roleRes] = await Promise.all([
          supabase.from("profiles").select("full_name").eq("user_id", user.id).single(),
          supabase.from("user_roles").select("role").eq("user_id", user.id).limit(1),
        ]);
        setProfile({
          full_name: profileRes.data?.full_name ?? null,
          role: roleRes.data?.[0]?.role ?? "",
        });
      } catch (err) {
        console.warn("Failed to load profile/role:", err);
        setProfile({ full_name: null, role: "" });
      }
    };
    load();
  }, [user]);

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const isActive = (path: string) => location.pathname === path;

  // Other online users (exclude self)
  const otherUsers = onlineUsers.filter((u) => u.userId !== user?.id);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <aside
        className={cn(
          "flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-200 border-r border-sidebar-border",
          collapsed ? "w-16" : "w-56"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 p-4 border-b border-sidebar-border h-16">
          <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
            <BarChart3 className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-none min-w-0">
              <span className="font-display text-sm font-bold text-sidebar-foreground truncate">Pot Labs</span>
              <span className="text-[10px] text-sidebar-foreground/50 truncate">A Pot Strategy Company</span>
            </div>
          )}
        </div>

        {/* Main Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {!collapsed && <p className="px-3 text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-semibold mb-2">Workspace</p>}
          {navItems.map((item) => {
            const active = isActive(item.to);
            const count = item.badgeKey ? badgeCounts[item.badgeKey] : 0;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors relative",
                  active
                    ? "bg-sidebar-primary/15 text-sidebar-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {count > 0 && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground px-1">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Online presence */}
        {otherUsers.length > 0 && (
          <div className="border-t border-sidebar-border px-2 py-2">
            {!collapsed && <p className="px-3 text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-semibold mb-2">Online now</p>}
            <div className={cn("flex gap-1 px-2", collapsed ? "flex-col items-center" : "flex-wrap")}>
              {otherUsers.slice(0, 5).map((u) => (
                <Tooltip key={u.userId}>
                  <TooltipTrigger asChild>
                    <div className="relative">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
                          {(u.fullName || u.email).slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-sidebar" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="text-xs font-medium">{u.fullName || u.email}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
              {otherUsers.length > 5 && (
                <span className="text-[10px] text-sidebar-foreground/50 self-center">+{otherUsers.length - 5}</span>
              )}
            </div>
          </div>
        )}

        {/* User info + footer */}
        <div className="border-t border-sidebar-border p-2 space-y-1">
          {!collapsed && user && (
            <div className="px-3 py-2 space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {profile.full_name || user.email?.split("@")[0]}
                </p>
                <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
              </div>
              <p className="text-[11px] text-sidebar-foreground/50 truncate">{user.email}</p>
              {profile.role && (
                <Badge variant="secondary" className="text-[10px] capitalize">{profile.role}</Badge>
              )}
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors w-full"
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && "Sign out"}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors w-full"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            {!collapsed && "Collapse"}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar with notifications */}
        <header className="h-12 border-b flex items-center justify-end px-4 gap-2 shrink-0 bg-background">
          <span className="text-xs text-muted-foreground mr-auto">
            {onlineUsers.length} user{onlineUsers.length !== 1 ? "s" : ""} online
          </span>
          <NotificationBell />
        </header>
        <main className="flex-1 overflow-y-auto bg-background">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
