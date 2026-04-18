import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/Layout";
import { spendByGroup, spendTrend, suppliers, projects } from "@/lib/mock-data";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics · comstruct C-Materials" },
      { name: "description", content: "Tail-spend analytics: by project, supplier, product group and foreman." },
    ],
  }),
  component: Analytics,
});

const CHF = (n: number) => new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(n);

const projectSpend = projects.map((p, i) => ({ project: p, spend: [14200, 11800, 9200, 7400][i] }));
const colors = ["oklch(0.92 0.18 100)", "oklch(0.22 0.012 250)", "oklch(0.55 0.012 250)", "oklch(0.78 0.005 95)", "oklch(0.62 0.14 155)"];

function Analytics() {
  return (
    <DashboardLayout title="Analytics" subtitle="Tail-spend visibility across projects, suppliers and groups">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Spend by project</div>
          <h3 className="text-display text-lg font-semibold mb-4">This month</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={projectSpend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.006 95)" vertical={false} />
                <XAxis dataKey="project" stroke="oklch(0.45 0.01 250)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis stroke="oklch(0.45 0.01 250)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.006 95)", borderRadius: 8, fontSize: 12 }} formatter={(v) => CHF(Number(v))} />
                <Bar dataKey="spend" fill="oklch(0.92 0.18 100)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Spend share by supplier</div>
          <h3 className="text-display text-lg font-semibold mb-4">MTD distribution</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={suppliers} dataKey="spend" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {suppliers.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.006 95)", borderRadius: 8, fontSize: 12 }} formatter={(v) => CHF(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">By product group</div>
          <h3 className="text-display text-lg font-semibold mb-4">Where the money goes</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={spendByGroup} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.006 95)" horizontal={false} />
                <XAxis type="number" stroke="oklch(0.45 0.01 250)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                <YAxis type="category" dataKey="group" stroke="oklch(0.45 0.01 250)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={100} />
                <Tooltip contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.006 95)", borderRadius: 8, fontSize: 12 }} formatter={(v) => CHF(Number(v))} />
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
              <BarChart data={spendTrend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.006 95)" vertical={false} />
                <XAxis dataKey="week" stroke="oklch(0.45 0.01 250)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis stroke="oklch(0.45 0.01 250)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.006 95)", borderRadius: 8, fontSize: 12 }} formatter={(v) => CHF(Number(v))} />
                <Bar dataKey="spend" fill="oklch(0.55 0.012 250)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
