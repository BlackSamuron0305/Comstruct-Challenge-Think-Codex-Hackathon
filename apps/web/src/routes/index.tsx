import { createFileRoute, Link } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/Layout";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { useProject, ALL_PROJECTS } from "@/components/dashboard/ProjectContext";
import { kpis, approvals, spendByGroup, spendTrend } from "@/lib/mock-data";
import { ArrowUpRight, ArrowDownRight, Info, TriangleAlert } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from "recharts";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview · comstruct C-Materials" },
      { name: "description", content: "Procurement control center for C-material tail spend across construction projects." },
    ],
  }),
  component: Overview,
});

function CHF(n: number) {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(n);
}

function Kpi({ label, value, delta, hint, accent }: { label: string; value: string; delta?: number; hint?: string; accent?: boolean }) {
  return (
    <div className={["relative rounded-lg border border-border bg-card p-5 overflow-hidden", accent ? "ring-1 ring-hivis/60" : ""].join(" ")}>
      {accent && <div className="absolute top-0 left-0 h-1 w-full bg-hivis" />}
      <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-display text-3xl font-semibold tabular tracking-tight">{value}</div>
        {typeof delta === "number" && (
          <span className={["text-mono text-xs inline-flex items-center", delta >= 0 ? "text-success" : "text-destructive"].join(" ")}>
            {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Overview() {
  const { project } = useProject();
  const scoped = project === ALL_PROJECTS ? approvals : approvals.filter((a) => a.project === project);
  const pending = scoped.filter((a) => a.status === "pending").slice(0, 5);
  const pendingValue = scoped.filter((a) => a.status === "pending").reduce((s, a) => s + a.total, 0);
  const factor = project === ALL_PROJECTS ? 1 : 0.32;
  const subtitle = project === ALL_PROJECTS
    ? "C-material tail spend across all active projects"
    : `Filtered to ${project}`;

  return (
    <DashboardLayout title="Overview" subtitle={subtitle}>
      {/* Explainer banner */}
      <div className="mb-6 rounded-lg border border-border bg-card p-4 flex items-start gap-3">
        <div className="h-9 w-9 grid place-items-center rounded-md bg-hivis text-hivis-foreground shrink-0">
          <Info className="h-4 w-4" />
        </div>
        <div className="text-sm">
          <div className="font-medium">You're looking at C-materials only</div>
          <p className="text-muted-foreground">
            Small everyday items &amp; consumables (screws, tape, PPE, drill bits…). Roughly{" "}
            <span className="text-mono">5%</span> of spend but <span className="text-mono">60%</span> of orders.
            A-materials (concrete, steel, windows) live in the main comstruct workspace.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi accent label="Pending approvals" value={String(pending.length === 0 ? 0 : scoped.filter((a) => a.status === "pending").length)} hint={`${CHF(pendingValue)} waiting`} />
        <Kpi label="Spend MTD" value={CHF(Math.round(kpis.spendMtd * factor))} delta={kpis.spendDeltaPct} hint="vs. last month" />
        <Kpi label="Orders / week" value={String(Math.round(kpis.ordersThisWeek * factor))} hint={`Avg ${CHF(kpis.avgOrderValue)} per order`} />
        <Kpi label="Top supplier" value={kpis.topSupplier} hint={project === ALL_PROJECTS ? "36% of MTD spend" : "On this project"} />
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Spend trend</div>
              <h3 className="text-display text-lg font-semibold">Weekly C-material spend</h3>
            </div>
            <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Last 7 weeks</div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spendTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stopColor="oklch(0.92 0.18 100)" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="oklch(0.92 0.18 100)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.006 95)" vertical={false} />
                <XAxis dataKey="week" stroke="oklch(0.45 0.01 250)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis stroke="oklch(0.45 0.01 250)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.006 95)", borderRadius: 8, fontSize: 12 }} formatter={(v) => CHF(Number(v))} />
                <Area type="monotone" dataKey="spend" stroke="oklch(0.22 0.012 250)" strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Spend by group</div>
          <h3 className="text-display text-lg font-semibold mb-4">This month</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={spendByGroup} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.006 95)" horizontal={false} />
                <XAxis type="number" stroke="oklch(0.45 0.01 250)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                <YAxis type="category" dataKey="group" stroke="oklch(0.45 0.01 250)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={80} />
                <Tooltip contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.006 95)", borderRadius: 8, fontSize: 12 }} formatter={(v) => CHF(Number(v))} />
                <Bar dataKey="value" fill="oklch(0.22 0.012 250)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent pending */}
      <div className="mt-6 rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Action required</div>
            <h3 className="text-display text-lg font-semibold flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 text-hivis" /> Awaiting your approval
            </h3>
          </div>
          <Link to="/approvals" className="text-sm text-primary hover:underline">View all →</Link>
        </div>
        <table className="w-full text-sm">
          <thead className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground bg-secondary">
            <tr>
              <th className="text-left font-normal px-5 py-3">Order</th>
              <th className="text-left font-normal px-5 py-3">Project</th>
              <th className="text-left font-normal px-5 py-3">Foreman</th>
              <th className="text-left font-normal px-5 py-3">Supplier</th>
              <th className="text-right font-normal px-5 py-3">Items</th>
              <th className="text-right font-normal px-5 py-3">Total</th>
              <th className="text-left font-normal px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((a) => (
              <tr key={a.id} className="border-t border-border hover:bg-secondary/60">
                <td className="px-5 py-3 text-mono text-xs">{a.orderRef}</td>
                <td className="px-5 py-3">{a.project}</td>
                <td className="px-5 py-3 text-muted-foreground">{a.foreman}</td>
                <td className="px-5 py-3">{a.supplier}</td>
                <td className="px-5 py-3 text-right tabular">{a.items}</td>
                <td className="px-5 py-3 text-right tabular font-medium">{CHF(a.total)}</td>
                <td className="px-5 py-3"><StatusBadge status={a.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
