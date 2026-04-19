import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  CheckSquare,
  ShoppingCart,
  Boxes,
  Truck,
  BarChart3,
  LogOut,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthContext";
import { api, type OrderSummary } from "@/lib/api";
import logo from "@/assets/comstruct-logo.svg";
import { ProjectSwitcher } from "./ProjectSwitcher";

const nav = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/approvals", label: "Approvals", icon: CheckSquare },
  { to: "/policies", label: "Statistics", icon: ShieldCheck },
  { to: "/orders", label: "Orders", icon: ShoppingCart },
  { to: "/catalog", label: "Catalog", icon: Boxes },
  { to: "/suppliers", label: "Suppliers", icon: Truck },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

function normalizeStatus(status?: string | null) {
  return (status ?? "").toLowerCase().replace(/[\s-]+/g, "_");
}

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, logout } = useAuth();
  const { data: orders = [] } = useQuery({
    queryKey: ["sidebar", "orders", "approvals"],
    queryFn: () => api.get<OrderSummary[]>("/api/orders", { params: { limit: 200 } }),
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  const { pendingApprovals, anomalousRequests } = useMemo(() => {
    const pending = orders.filter((order) => {
      const status = normalizeStatus(order.status);
      return status === "pending" || status === "pending_approval";
    });

    return {
      pendingApprovals: pending.length,
      anomalousRequests: pending.filter((order) => order.requires_approval || (order.notes ?? "").includes("[approval]")).length,
    };
  }, [orders]);

  return (
    <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r border-border bg-sidebar/95 backdrop-blur">
      <div className="px-5 py-4 border-b border-border">
        <img src={logo} alt="comstruct" className="h-10 w-auto max-w-[170px]" />
        <div className="mt-2 text-mono text-[10px] uppercase text-muted-foreground tracking-widest">
          C-Materials workspace
        </div>
      </div>

      <ProjectSwitcher />

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <div className="mb-2 px-3 text-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Operations
        </div>
        {nav.map((item) => {
          const active = pathname === item.to;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={[
                "group flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/80 hover:bg-accent hover:text-foreground",
              ].join(" ")}
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
              {item.to === "/approvals" && pendingApprovals > 0 ? (
                <span
                  className={[
                    "text-mono text-[10px] px-1.5 py-0.5 rounded",
                    active ? "bg-hivis text-hivis-foreground" : "bg-hivis/90 text-hivis-foreground",
                  ].join(" ")}
                >
                  {pendingApprovals}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="m-3 rounded-lg border border-dashed border-border p-3 bg-card space-y-3">
        <div>
          <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Procurement
          </div>
          <div className="mt-1 text-sm font-medium">{user?.name || user?.email || "S. Meier"}</div>
          <div className="text-xs text-muted-foreground">{user?.role || "Central"} · Zürich HQ</div>
        </div>
        <div className="rounded-md bg-warning/20 border border-warning/30 px-2 py-1.5 flex items-center gap-2">
          <ShieldAlert className="h-3.5 w-3.5 text-warning-foreground" />
          <span className="text-xs">{anomalousRequests} anomalous request{anomalousRequests === 1 ? "" : "s"} pending</span>
        </div>
        <button
          onClick={logout}
          className="w-full rounded-md border border-border px-3 py-2 text-sm hover:bg-accent inline-flex items-center justify-center gap-2"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    </aside>
  );
}
