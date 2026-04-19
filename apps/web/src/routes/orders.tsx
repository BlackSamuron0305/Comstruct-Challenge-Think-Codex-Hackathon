import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { DashboardLayout } from "@/components/dashboard/Layout";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { useProject, ALL_PROJECTS } from "@/components/dashboard/ProjectContext";
import { api, formatCurrency, shortId, type OrderSummary, type ProjectRecord } from "@/lib/api";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Orders · comstruct C-Materials" },
      { name: "description", content: "All C-material orders across projects, suppliers and statuses." },
    ],
  }),
  component: Orders,
});

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function Orders() {
  const { project } = useProject();
  const { data: orders = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["orders", "list"],
    queryFn: () => api.get<OrderSummary[]>("/api/orders", { params: { limit: 200 } }),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects", "orders"],
    queryFn: () => api.get<ProjectRecord[]>("/api/projects"),
  });

  const projectMap = new Map(projects.map((item) => [item.id, item.name]));
  const rows = orders
    .map((order) => ({
      id: order.id,
      ref: shortId(order.id).toUpperCase(),
      date: formatDate(order.created_at),
      project: projectMap.get(order.project_id ?? "") ?? shortId(order.project_id),
      foreman: shortId(order.foreman_id).toUpperCase(),
      supplier:
        order.supplier_name ??
        order.items?.[0]?.product_snapshot?.supplier_name ??
        shortId(order.items?.[0]?.product_snapshot?.supplier_id),
      items: order.items?.length ?? 0,
      total: Number(order.total_amount ?? 0),
      currency: order.currency || "CHF",
      status: order.status,
    }))
    .filter((row) => project === ALL_PROJECTS || row.project === project);

  return (
    <DashboardLayout
      title="Orders"
      subtitle={project === ALL_PROJECTS ? "Every live C-material order, end-to-end" : `Orders for ${project}`}
    >
      {isLoading ? (
        <div className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">Loading live orders…</div>
      ) : isError ? (
        <div className="rounded-lg border border-border bg-card p-8 text-sm">
          <div className="font-medium">Orders could not be loaded.</div>
          <button onClick={() => void refetch()} className="mt-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">Retry</button>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground bg-secondary">
              <tr>
                <th className="text-left font-normal px-5 py-3">Ref</th>
                <th className="text-left font-normal px-5 py-3">Date</th>
                <th className="text-left font-normal px-5 py-3">Project</th>
                <th className="text-left font-normal px-5 py-3">Foreman</th>
                <th className="text-left font-normal px-5 py-3">Supplier</th>
                <th className="text-right font-normal px-5 py-3">Items</th>
                <th className="text-right font-normal px-5 py-3">Total</th>
                <th className="text-left font-normal px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border hover:bg-secondary/60">
                  <td className="px-5 py-3 text-mono text-xs">{row.ref}</td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">{row.date}</td>
                  <td className="px-5 py-3">{row.project}</td>
                  <td className="px-5 py-3 text-muted-foreground">{row.foreman}</td>
                  <td className="px-5 py-3">{row.supplier}</td>
                  <td className="px-5 py-3 text-right tabular">{row.items}</td>
                  <td className="px-5 py-3 text-right tabular font-medium">{formatCurrency(row.total, row.currency)}</td>
                  <td className="px-5 py-3"><StatusBadge status={row.status} /></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">No live orders match the current filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  );
}
