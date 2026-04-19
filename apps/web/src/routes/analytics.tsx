import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { DashboardLayout } from "@/components/dashboard/Layout";
import { api, formatCurrency, shortId, type OrderSummary, type ProjectRecord } from "@/lib/api";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics · comstruct C-Materials" },
      { name: "description", content: "Tail-spend analytics: by project, supplier, product group and foreman." },
    ],
  }),
  component: Analytics,
});

const colors = ["oklch(0.92 0.18 100)", "oklch(0.22 0.012 250)", "oklch(0.55 0.012 250)", "oklch(0.78 0.005 95)", "oklch(0.62 0.14 155)"];

function weekKey(value: string) {
  const date = new Date(value);
  const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const day = Math.floor((date.getTime() - firstDay.getTime()) / 86400000);
  const week = Math.ceil((day + firstDay.getUTCDay() + 1) / 7);
  return `W${week}`;
}

function Analytics() {
  const { data: orders = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["analytics", "orders"],
    queryFn: () => api.get<OrderSummary[]>("/api/orders", { params: { limit: 200 } }),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["analytics", "projects"],
    queryFn: () => api.get<ProjectRecord[]>("/api/projects"),
  });

  const projectMap = new Map(projects.map((item) => [item.id, item.name]));
  const projectSpend = new Map<string, number>();
  const supplierSpend = new Map<string, number>();
  const groupSpend = new Map<string, number>();
  const spendTrend = new Map<string, number>();

  orders.forEach((order) => {
    const total = Number(order.total_amount ?? 0);
    const projectName = projectMap.get(order.project_id ?? "") ?? shortId(order.project_id);
    const supplierName = order.supplier_name ?? order.items?.[0]?.product_snapshot?.supplier_name ?? "Unknown supplier";
    projectSpend.set(projectName, (projectSpend.get(projectName) ?? 0) + total);
    supplierSpend.set(supplierName, (supplierSpend.get(supplierName) ?? 0) + total);
    spendTrend.set(weekKey(order.created_at), (spendTrend.get(weekKey(order.created_at)) ?? 0) + total);
    order.items?.forEach((item) => {
      const group = item.product_snapshot?.category ?? "Uncategorised";
      groupSpend.set(group, (groupSpend.get(group) ?? 0) + Number(item.line_total ?? 0));
    });
  });

  const projectRows = [...projectSpend.entries()].map(([project, spend]) => ({ project, spend })).sort((a, b) => b.spend - a.spend);
  const supplierRows = [...supplierSpend.entries()].map(([name, spend]) => ({ name, spend })).sort((a, b) => b.spend - a.spend).slice(0, 6);
  const groupRows = [...groupSpend.entries()].map(([group, value]) => ({ group, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  const trendRows = [...spendTrend.entries()].map(([week, spend]) => ({ week, spend })).sort((a, b) => a.week.localeCompare(b.week)).slice(-8);

  return (
    <DashboardLayout title="Analytics" subtitle="Live tail-spend visibility across projects, suppliers and groups">
      {isLoading ? (
        <div className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">Loading analytics…</div>
      ) : isError ? (
        <div className="rounded-lg border border-border bg-card p-8 text-sm">
          <div className="font-medium">Analytics data could not be loaded.</div>
          <button onClick={() => void refetch()} className="mt-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">Retry</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Spend by project</div>
            <h3 className="text-display text-lg font-semibold mb-4">Live order totals</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectRows} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.006 95)" vertical={false} />
                  <XAxis dataKey="project" stroke="oklch(0.45 0.01 250)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis stroke="oklch(0.45 0.01 250)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.006 95)", borderRadius: 8, fontSize: 12 }} formatter={(v) => formatCurrency(Number(v), "EUR")} />
                  <Bar dataKey="spend" fill="oklch(0.92 0.18 100)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Spend share by supplier</div>
            <h3 className="text-display text-lg font-semibold mb-4">Current distribution</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={supplierRows} dataKey="spend" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                    {supplierRows.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.006 95)", borderRadius: 8, fontSize: 12 }} formatter={(v) => formatCurrency(Number(v), "EUR")} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">By product group</div>
            <h3 className="text-display text-lg font-semibold mb-4">Where live spend is going</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={groupRows} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.006 95)" horizontal={false} />
                  <XAxis type="number" stroke="oklch(0.45 0.01 250)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="group" stroke="oklch(0.45 0.01 250)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={110} />
                  <Tooltip contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.006 95)", borderRadius: 8, fontSize: 12 }} formatter={(v) => formatCurrency(Number(v), "EUR")} />
                  <Bar dataKey="value" fill="oklch(0.22 0.012 250)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Weekly trend</div>
            <h3 className="text-display text-lg font-semibold mb-4">Tail spend velocity</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendRows} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.006 95)" vertical={false} />
                  <XAxis dataKey="week" stroke="oklch(0.45 0.01 250)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis stroke="oklch(0.45 0.01 250)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.006 95)", borderRadius: 8, fontSize: 12 }} formatter={(v) => formatCurrency(Number(v), "EUR")} />
                  <Bar dataKey="spend" fill="oklch(0.55 0.012 250)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
