import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, TriangleAlert } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DashboardLayout } from "@/components/dashboard/Layout";
import { QueryState } from "@/components/dashboard/QueryState";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { useProject, ALL_PROJECTS } from "@/components/dashboard/ProjectContext";
import {
  api,
  formatCurrency,
  shortId,
  type OrderSummary,
  type ProjectRecord,
  type SupplierRecord,
} from "@/lib/api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview · comstruct C-Materials" },
      {
        name: "description",
        content:
          "Procurement control center for C-material tail spend across construction projects.",
      },
    ],
  }),
  component: Overview,
});

function weekKey(value: string) {
  const date = new Date(value);
  const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const day = Math.floor((date.getTime() - firstDay.getTime()) / 86400000);
  const week = Math.ceil((day + firstDay.getUTCDay() + 1) / 7);
  return `W${week}`;
}

function Kpi({
  label,
  value,
  delta,
  hint,
  accent,
}: {
  label: string;
  value: string;
  delta?: number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={[
        "relative rounded-lg border border-border bg-card p-5 overflow-hidden",
        accent ? "ring-1 ring-hivis/60" : "",
      ].join(" ")}
    >
      {accent && <div className="absolute top-0 left-0 h-1 w-full bg-hivis" />}
      <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-display text-3xl font-semibold tabular tracking-tight">{value}</div>
        {typeof delta === "number" && (
          <span
            className={[
              "text-mono text-xs inline-flex items-center",
              delta >= 0 ? "text-success" : "text-destructive",
            ].join(" ")}
          >
            {delta >= 0 ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
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
  const {
    data: orders = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["overview", "orders"],
    queryFn: () => api.get<OrderSummary[]>("/api/orders", { params: { limit: 200 } }),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["overview", "projects"],
    queryFn: () => api.get<ProjectRecord[]>("/api/projects"),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["overview", "suppliers"],
    queryFn: () => api.get<SupplierRecord[]>("/api/suppliers"),
  });

  const projectMap = new Map(projects.map((item) => [item.id, item.name]));
  const scoped = orders.filter((order) => {
    const projectName = projectMap.get(order.project_id ?? "") ?? shortId(order.project_id);
    return project === ALL_PROJECTS || projectName === project;
  });

  const pending = scoped.filter((order) => ["pending", "pending_approval"].includes(order.status));
  const pendingRows = pending.slice(0, 5).map((order) => ({
    id: order.id,
    orderRef: shortId(order.id).toUpperCase(),
    project: projectMap.get(order.project_id ?? "") ?? shortId(order.project_id),
    requester: order.foreman_name?.trim() || shortId(order.foreman_id).toUpperCase(),
    supplier: order.supplier_name ?? order.items?.[0]?.product_snapshot?.supplier_name ?? "—",
    items: order.items?.length ?? 0,
    total: Number(order.total_amount ?? 0),
    currency: order.currency || "EUR",
    status: order.status,
  }));

  const pendingValue = pending.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);
  const now = Date.now();
  const recentWeekOrders = scoped.filter(
    (order) => now - new Date(order.created_at).getTime() <= 7 * 24 * 60 * 60 * 1000,
  );
  const spendMtd = scoped.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);
  const avgOrderValue = scoped.length ? spendMtd / scoped.length : 0;
  const supplierSpend = new Map<string, number>();
  const groupSpend = new Map<string, number>();
  const trendSpend = new Map<string, number>();

  scoped.forEach((order) => {
    const total = Number(order.total_amount ?? 0);
    const supplier =
      order.supplier_name ??
      order.items?.[0]?.product_snapshot?.supplier_name ??
      "Unknown supplier";
    supplierSpend.set(supplier, (supplierSpend.get(supplier) ?? 0) + total);
    trendSpend.set(
      weekKey(order.created_at),
      (trendSpend.get(weekKey(order.created_at)) ?? 0) + total,
    );
    order.items?.forEach((item) => {
      const group = item.product_snapshot?.category ?? "Uncategorised";
      groupSpend.set(group, (groupSpend.get(group) ?? 0) + Number(item.line_total ?? 0));
    });
  });

  const topSupplier =
    [...supplierSpend.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
    suppliers[0]?.name ??
    "—";
  const spendByGroup = [...groupSpend.entries()]
    .map(([group, value]) => ({ group, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const spendTrend = [...trendSpend.entries()]
    .map(([week, spend]) => ({ week, spend }))
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-7);
  const previousPeriodSpend = spendTrend
    .slice(0, Math.max(1, spendTrend.length - 1))
    .reduce((sum, row) => sum + row.spend, 0);
  const spendDeltaPct =
    previousPeriodSpend > 0 ? ((spendMtd - previousPeriodSpend) / previousPeriodSpend) * 100 : 0;
  const subtitle =
    project === ALL_PROJECTS
      ? "Live C-material tail spend across all active projects"
      : `Filtered to ${project}`;

  return (
    <DashboardLayout title="Overview" subtitle={subtitle}>
      {isLoading ? (
        <QueryState
          kind="loading"
          title="Loading live metrics"
          description="Spend, approvals, and project signals are being refreshed now."
        />
      ) : isError ? (
        <QueryState
          kind="error"
          title="Overview metrics could not be loaded"
          description="The control center is temporarily unavailable."
          onRetry={() => void refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi
              accent
              label="Pending approvals"
              value={String(pending.length)}
              hint={`${formatCurrency(pendingValue, "EUR")} waiting`}
            />
            <Kpi
              label="Spend MTD"
              value={formatCurrency(spendMtd, "EUR")}
              delta={spendDeltaPct}
              hint="vs. recent trend"
            />
            <Kpi
              label="Orders / week"
              value={String(recentWeekOrders.length)}
              hint={`Avg ${formatCurrency(avgOrderValue, "EUR")} per order`}
            />
            <Kpi
              label="Top supplier"
              value={topSupplier}
              hint={
                project === ALL_PROJECTS ? "Highest current spend" : "Within current project view"
              }
            />
          </div>

          <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 rounded-lg border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Spend trend
                  </div>
                  <h3 className="text-display text-lg font-semibold">Weekly C-material spend</h3>
                </div>
                <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Live order history
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={spendTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="oklch(0.92 0.18 100)" stopOpacity={0.7} />
                        <stop offset="100%" stopColor="oklch(0.92 0.18 100)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="oklch(0.88 0.006 95)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="week"
                      stroke="oklch(0.45 0.01 250)"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="oklch(0.45 0.01 250)"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "oklch(1 0 0)",
                        border: "1px solid oklch(0.88 0.006 95)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v) => formatCurrency(Number(v), "EUR")}
                    />
                    <Area
                      type="monotone"
                      dataKey="spend"
                      stroke="oklch(0.22 0.012 250)"
                      strokeWidth={2}
                      fill="url(#g1)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Spend by group
              </div>
              <h3 className="text-display text-lg font-semibold mb-4">Current allocation</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={spendByGroup}
                    layout="vertical"
                    margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="oklch(0.88 0.006 95)"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      stroke="oklch(0.45 0.01 250)"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                    />
                    <YAxis
                      type="category"
                      dataKey="group"
                      stroke="oklch(0.45 0.01 250)"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={100}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "oklch(1 0 0)",
                        border: "1px solid oklch(0.88 0.006 95)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v) => formatCurrency(Number(v), "EUR")}
                    />
                    <Bar dataKey="value" fill="oklch(0.22 0.012 250)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Action required
                </div>
                <h3 className="text-display text-lg font-semibold flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4 text-hivis" /> Awaiting your approval
                </h3>
              </div>
              <Link to="/approvals" className="text-sm text-primary hover:underline">
                View all →
              </Link>
            </div>
            <table className="w-full text-sm">
              <thead className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground bg-secondary">
                <tr>
                  <th className="text-left font-normal px-5 py-3">Order</th>
                  <th className="text-left font-normal px-5 py-3">Project</th>
                  <th className="text-left font-normal px-5 py-3">Requester</th>
                  <th className="text-left font-normal px-5 py-3">Supplier</th>
                  <th className="text-right font-normal px-5 py-3">Items</th>
                  <th className="text-right font-normal px-5 py-3">Total</th>
                  <th className="text-left font-normal px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {pendingRows.map((row) => (
                  <tr key={row.id} className="border-t border-border hover:bg-secondary/60">
                    <td className="px-5 py-3 text-mono text-xs">{row.orderRef}</td>
                    <td className="px-5 py-3">{row.project}</td>
                    <td className="px-5 py-3 text-muted-foreground">{row.requester}</td>
                    <td className="px-5 py-3">{row.supplier}</td>
                    <td className="px-5 py-3 text-right tabular">{row.items}</td>
                    <td className="px-5 py-3 text-right tabular font-medium">
                      {formatCurrency(row.total, row.currency)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
                {pendingRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-10 text-center text-sm text-muted-foreground"
                    >
                      No orders are currently waiting for review.{" "}
                      <Link to="/orders" className="text-primary hover:underline">
                        Open the live order timeline
                      </Link>{" "}
                      to monitor the next request.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
