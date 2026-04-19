import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, CheckSquare, ShoppingCart, Boxes, Truck, BarChart3, HardHat, ShieldCheck, ShieldAlert } from "lucide-react";
import { ProjectSwitcher } from "./ProjectSwitcher";

const nav = [
  { to: "/",          label: "Overview",   icon: LayoutDashboard },
  { to: "/approvals", label: "Approvals",  icon: CheckSquare, badge: 14 },
  { to: "/policies",  label: "Policies",   icon: ShieldCheck },
  { to: "/orders",    label: "Orders",     icon: ShoppingCart },
  { to: "/catalog",   label: "Catalog",    icon: Boxes },
  { to: "/suppliers", label: "Suppliers",  icon: Truck },
  { to: "/analytics", label: "Analytics",  icon: BarChart3 },
] as const;

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r border-border bg-sidebar/95 backdrop-blur">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <HardHat className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-display text-base font-semibold tracking-tight">comstruct</div>
          <div className="text-mono text-[10px] uppercase text-muted-foreground tracking-widest">C-Materials</div>
        </div>
      </div>

      <ProjectSwitcher />

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <div className="mb-2 px-3 text-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Operations</div>
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
              {"badge" in item && item.badge ? (
                <span className={[
                  "text-mono text-[10px] px-1.5 py-0.5 rounded",
                  active ? "bg-hivis text-hivis-foreground" : "bg-hivis/90 text-hivis-foreground",
                ].join(" ")}>
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="m-3 rounded-lg border border-dashed border-border p-3 bg-card space-y-3">
        <div>
          <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Procurement</div>
          <div className="mt-1 text-sm font-medium">S. Meier</div>
          <div className="text-xs text-muted-foreground">Central · Zürich HQ</div>
        </div>
        <div className="rounded-md bg-warning/20 border border-warning/30 px-2 py-1.5 flex items-center gap-2">
          <ShieldAlert className="h-3.5 w-3.5 text-warning-foreground" />
          <span className="text-xs">3 anomalous requests pending</span>
        </div>
      </div>
    </aside>
  );
}
