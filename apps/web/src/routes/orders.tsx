import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { DashboardLayout } from "@/components/dashboard/Layout";
import { QueryState } from "@/components/dashboard/QueryState";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { useProject, ALL_PROJECTS } from "@/components/dashboard/ProjectContext";
import { api, formatCurrency, shortId, type OrderSummary, type ProjectRecord } from "@/lib/api";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Orders · comstruct C-Materials" },
      {
        name: "description",
        content: "All C-material orders across projects, suppliers and statuses.",
      },
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

function formatQty(value?: number | string) {
  const quantity = Number(value ?? 0);
  if (!Number.isFinite(quantity) || quantity <= 0) return "";
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.00$/, "");
}

function describeItems(order: Pick<OrderSummary, "items">) {
  const items = order.items ?? [];
  if (!items.length) return "No line items captured";

  const preview = items
    .slice(0, 2)
    .map((item) => {
      const label =
        item.product_snapshot?.name?.trim() ||
        item.product_snapshot?.sku?.trim() ||
        "Material item";
      const qty = formatQty(item.quantity);
      return qty ? `${label} × ${qty}` : label;
    })
    .join(" · ");

  const remaining = items.length - 2;
  return remaining > 0 ? `${preview} +${remaining} more` : preview;
}

function normalizeStatus(status?: string | null) {
  return (status ?? "").toLowerCase().replace(/\s+/g, "_");
}

function Orders() {
  const { project } = useProject();
  const {
    data: orders = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
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
      requester: order.foreman_name?.trim() || shortId(order.foreman_id).toUpperCase(),
      supplier:
        order.supplier_name ??
        order.items?.[0]?.product_snapshot?.supplier_name ??
        "Awaiting supplier confirmation",
      itemPreview: describeItems(order),
      items: order.items?.length ?? 0,
      total: Number(order.total_amount ?? 0),
      currency: order.currency || "EUR",
      status: order.status,
    }))
    .filter((row) => project === ALL_PROJECTS || row.project === project);

  const pendingCount = rows.filter((row) =>
    ["pending", "pending_approval"].includes(normalizeStatus(row.status)),
  ).length;
  const deliveredCount = rows.filter((row) =>
    ["delivered", "completed", "received"].includes(normalizeStatus(row.status)),
  ).length;
  const rejectedCount = rows.filter((row) =>
    ["rejected", "cancelled", "canceled"].includes(normalizeStatus(row.status)),
  ).length;
  const inFlightCount = Math.max(rows.length - pendingCount - deliveredCount - rejectedCount, 0);

  return (
    <DashboardLayout
      title="Orders"
      subtitle={
        project === ALL_PROJECTS
          ? "Every live C-material order, end-to-end"
          : `Orders for ${project}`
      }
    >
      {isLoading ? (
        <QueryState
          kind="loading"
          title="Loading live orders"
          description="The full requester and delivery timeline is being refreshed now."
        />
      ) : isError ? (
        <QueryState
          kind="error"
          title="Orders could not be loaded"
          description="The live order timeline is temporarily unavailable."
          onRetry={() => void refetch()}
        />
      ) : (
        <>
          <div className="mb-4 rounded-lg border border-border bg-card p-4 text-sm">
            <div className="font-medium">Live order timeline</div>
            <p className="mt-1 text-muted-foreground">
              Use this view to answer requesters quickly and spot orders that still need approval.{" "}
              <Link to="/approvals" className="text-primary hover:underline">
                Open the approval queue
              </Link>{" "}
              if something is blocked.
            </p>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Waiting for review</div>
              <div className="mt-1 text-2xl font-semibold">{pendingCount}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Ordered or moving</div>
              <div className="mt-1 text-2xl font-semibold">{inFlightCount}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Delivered</div>
              <div className="mt-1 text-2xl font-semibold">{deliveredCount}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Rejected</div>
              <div className="mt-1 text-2xl font-semibold">{rejectedCount}</div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground bg-secondary">
                <tr>
                  <th className="text-left font-normal px-5 py-3">Ref</th>
                  <th className="text-left font-normal px-5 py-3">Date</th>
                  <th className="text-left font-normal px-5 py-3">Project</th>
                  <th className="text-left font-normal px-5 py-3">Requester</th>
                  <th className="text-left font-normal px-5 py-3">Supplier</th>
                  <th className="text-left font-normal px-5 py-3">Ordered items</th>
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
                    <td className="px-5 py-3 text-muted-foreground">{row.requester}</td>
                    <td className="px-5 py-3">{row.supplier}</td>
                    <td className="px-5 py-3 max-w-[24rem] text-xs text-muted-foreground">
                      {row.itemPreview}
                    </td>
                    <td className="px-5 py-3 text-right tabular">{row.items}</td>
                    <td className="px-5 py-3 text-right tabular font-medium">
                      {formatCurrency(row.total, row.currency)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-5 py-10 text-center text-sm text-muted-foreground"
                    >
                      No live orders match the current filter.
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
