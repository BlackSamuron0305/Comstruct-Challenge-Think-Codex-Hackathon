import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, Check, Filter, Package, User, X } from "lucide-react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/dashboard/Layout";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { useProject, ALL_PROJECTS } from "@/components/dashboard/ProjectContext";
import { api, formatCurrency, shortId, type ApprovalRule, type OrderSummary, type ProjectRecord } from "@/lib/api";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals · comstruct C-Materials" },
      { name: "description", content: "Review and approve foreman C-material orders against thresholds and framework contracts." },
    ],
  }),
  component: Approvals,
});

const FILTERS = ["All", "Pending", "Approved", "Rejected"] as const;

function routeLabel(total: number) {
  if (total >= 500) return "Central proc.";
  if (total >= 200) return "PM approval";
  return "Auto-approved";
}

function routeTone(total: number) {
  if (total >= 500) return "bg-destructive/10 text-destructive";
  if (total >= 200) return "bg-warning/30 text-warning-foreground";
  return "bg-success/15 text-[oklch(0.42_0.13_155)]";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function Approvals() {
  const queryClient = useQueryClient();
  const { project } = useProject();
  const [activeFilter, setActiveFilter] = useState<string>("Pending");
  const [selected, setSelected] = useState<OrderSummary | null>(null);
  const [note, setNote] = useState("");

  const { data: orders = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["approvals", "orders"],
    queryFn: () => api.get<OrderSummary[]>("/api/orders", { params: { limit: 200 } }),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["approvals", "projects"],
    queryFn: () => api.get<ProjectRecord[]>("/api/projects"),
  });
  const { data: approvalRule } = useQuery({
    queryKey: ["approvals", "rule"],
    queryFn: () => api.get<ApprovalRule | null>("/api/approvals/rule"),
  });

  const projectMap = new Map(projects.map((item) => [item.id, item.name]));

  const approveMutation = useMutation({
    mutationFn: (orderId: string) => api.post(`/api/orders/${orderId}/approve`, null),
    onSuccess: () => {
      toast.success("Order approved");
      setSelected(null);
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Approval failed");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) => api.post(`/api/orders/${orderId}/reject`, { reason }),
    onSuccess: () => {
      toast.success("Order rejected");
      setSelected(null);
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Rejection failed");
    },
  });

  const rows = useMemo(() => {
    return orders
      .map((order) => ({
        ...order,
        projectName: projectMap.get(order.project_id ?? "") ?? shortId(order.project_id),
        supplierName: order.supplier_name ?? order.items?.[0]?.product_snapshot?.supplier_name ?? "—",
        total: Number(order.total_amount ?? 0),
      }))
      .filter((order) => project === ALL_PROJECTS || order.projectName === project)
      .filter((order) => {
        if (activeFilter === "Pending") return ["pending", "pending_approval"].includes(order.status);
        if (activeFilter === "Approved") return ["approved", "ordered", "delivered"].includes(order.status);
        if (activeFilter === "Rejected") return order.status === "rejected";
        return true;
      });
  }, [activeFilter, orders, project, projectMap]);

  const pendingOrders = orders.filter((order) => ["pending", "pending_approval"].includes(order.status));
  const pendingValue = pendingOrders.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);
  const highRiskCount = pendingOrders.filter((order) => Number(order.total_amount ?? 0) >= Number(approvalRule?.threshold_amount ?? 500)).length;
  const restrictedCategories = approvalRule?.restricted_categories ?? [];

  return (
    <>
      <DashboardLayout title="Approvals" subtitle={`${project === ALL_PROJECTS ? "All projects" : project} · live order review and sign-off`}>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {FILTERS.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={[
                "text-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-md border",
                activeFilter === filter ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-accent",
              ].join(" ")}
            >
              {filter}
            </button>
          ))}
          <button className="ml-auto text-sm inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card hover:bg-accent">
            <Filter className="h-4 w-4" /> Live filters
          </button>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Pending approvals</div>
            <div className="mt-1 text-2xl font-semibold">{pendingOrders.length}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Queue value</div>
            <div className="mt-1 text-2xl font-semibold">{formatCurrency(pendingValue, orders[0]?.currency ?? "CHF")}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Policy threshold</div>
            <div className="mt-1 text-2xl font-semibold">{formatCurrency(Number(approvalRule?.threshold_amount ?? 200), orders[0]?.currency ?? "CHF")}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Escalated orders</div>
            <div className="mt-1 text-2xl font-semibold">{highRiskCount}</div>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">Loading approval queue…</div>
        ) : isError ? (
          <div className="rounded-lg border border-border bg-card p-8 text-sm">
            <div className="font-medium">Approval data could not be loaded.</div>
            <button onClick={() => void refetch()} className="mt-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">Retry</button>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: "960px" }}>
              <thead className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground bg-secondary">
                <tr>
                  <th className="text-left font-normal px-5 py-3 whitespace-nowrap">Order</th>
                  <th className="text-left font-normal px-5 py-3 whitespace-nowrap">Submitted</th>
                  <th className="text-left font-normal px-5 py-3 whitespace-nowrap">Project</th>
                  <th className="text-left font-normal px-5 py-3 whitespace-nowrap">Foreman</th>
                  <th className="text-left font-normal px-5 py-3 whitespace-nowrap">Supplier</th>
                  <th className="text-left font-normal px-5 py-3 whitespace-nowrap">Route</th>
                  <th className="text-right font-normal px-5 py-3 whitespace-nowrap">Items</th>
                  <th className="text-right font-normal px-5 py-3 whitespace-nowrap">Total</th>
                  <th className="text-left font-normal px-5 py-3 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((order) => (
                  <tr key={order.id} className={["border-t border-border hover:bg-secondary/60 cursor-pointer", selected?.id === order.id ? "bg-secondary/80" : ""].join(" ")} onClick={() => setSelected(order)}>
                    <td className="px-5 py-3 text-mono text-xs whitespace-nowrap">{shortId(order.id).toUpperCase()}</td>
                    <td className="px-5 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDate(order.created_at)}</td>
                    <td className="px-5 py-3 whitespace-nowrap">{order.projectName}</td>
                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">{shortId(order.foreman_id).toUpperCase()}</td>
                    <td className="px-5 py-3 whitespace-nowrap">{order.supplierName}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className={["text-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded", routeTone(order.total)].join(" ")}>{routeLabel(order.total)}</span>
                    </td>
                    <td className="px-5 py-3 text-right tabular whitespace-nowrap">{order.items?.length ?? 0}</td>
                    <td className="px-5 py-3 text-right tabular font-medium whitespace-nowrap">{formatCurrency(order.total, order.currency)}</td>
                    <td className="px-5 py-3 whitespace-nowrap"><StatusBadge status={order.status} /></td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-10 text-center text-muted-foreground text-sm">No live orders match the current approval filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </DashboardLayout>

      {selected && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/20" onClick={() => setSelected(null)} />
          <div className="w-[500px] max-w-full bg-background border-l border-border flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/30 shrink-0">
              <div>
                <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Order review</div>
                <div className="text-display text-lg font-semibold mt-0.5">{shortId(selected.id).toUpperCase()}</div>
              </div>
              <button onClick={() => setSelected(null)} className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent ml-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div className="rounded-md p-4 border bg-warning/10 border-warning/20">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-warning-foreground mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-warning-foreground">Approval route: {routeLabel(Number(selected.total_amount ?? 0))}</div>
                    <div className="text-xs text-muted-foreground mt-1 leading-relaxed">Review the line items, total amount, and supplier before approving or rejecting.</div>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-border p-4">
                <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Policy snapshot</div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Threshold</div>
                    <div className="font-medium">{formatCurrency(Number(approvalRule?.threshold_amount ?? 200), selected.currency)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Auto approve below</div>
                    <div className="font-medium">{approvalRule?.auto_approve_below === false ? "No" : "Yes"}</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  Restricted categories: {restrictedCategories.length ? restrictedCategories.join(", ") : "None configured"}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Project</div>
                  <div className="font-medium">{projectMap.get(selected.project_id ?? "") ?? shortId(selected.project_id)}</div>
                </div>
                <div>
                  <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Submitted</div>
                  <div>{formatDate(selected.created_at)}</div>
                </div>
              </div>

              <div className="rounded-md border border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">From · Foreman</div>
                </div>
                <div className="font-semibold text-base">{shortId(selected.foreman_id).toUpperCase()}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Live order owner from the order service</div>
              </div>

              <div className="rounded-md border border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">To · Supplier</div>
                </div>
                <div className="font-semibold text-base">{selected.supplier_name ?? selected.items?.[0]?.product_snapshot?.supplier_name ?? "Unknown supplier"}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Order currency: {selected.currency}</div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Line items · {selected.items?.length ?? 0} positions</div>
                </div>
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary text-muted-foreground">
                      <tr>
                        <th className="text-left font-normal px-3 py-2">SKU</th>
                        <th className="text-left font-normal px-3 py-2">Description</th>
                        <th className="text-right font-normal px-3 py-2">Qty</th>
                        <th className="text-right font-normal px-3 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.items?.map((item) => (
                        <tr key={item.id} className="border-t border-border">
                          <td className="px-3 py-2 font-mono">{item.product_snapshot?.sku ?? shortId(item.id)}</td>
                          <td className="px-3 py-2">{item.product_snapshot?.name ?? "Unknown item"}</td>
                          <td className="px-3 py-2 text-right tabular">{item.quantity ?? "—"}</td>
                          <td className="px-3 py-2 text-right tabular font-medium">{formatCurrency(Number(item.line_total ?? 0), selected.currency)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-border bg-secondary/50 font-semibold text-sm">
                        <td colSpan={3} className="px-3 py-2.5 text-right">Order total</td>
                        <td className="px-3 py-2.5 text-right tabular">{formatCurrency(Number(selected.total_amount ?? 0), selected.currency)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-md border border-border p-4 text-sm">
                <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Audit context</div>
                <ul className="mt-3 space-y-2 text-muted-foreground">
                  <li>Submitted on {formatDate(selected.created_at)}</li>
                  <li>Current status: <span className="font-medium text-foreground">{selected.status}</span></li>
                  {selected.notes ? <li>Requester note: {selected.notes}</li> : null}
                  {selected.rejection_reason ? <li>Last rejection reason: {selected.rejection_reason}</li> : null}
                </ul>
              </div>

              {(["pending", "pending_approval"].includes(selected.status)) && (
                <div>
                  <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Decision note</label>
                  <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add context for the requester or procurement log…" rows={3} className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none" />
                  <div className="mt-1 text-xs text-muted-foreground">This note will be used as the rejection reason if you decline the order.</div>
                </div>
              )}
            </div>

            {(["pending", "pending_approval"].includes(selected.status)) ? (
              <div className="px-6 py-4 border-t border-border flex gap-3 shrink-0 bg-background">
                <button onClick={() => approveMutation.mutate(selected.id)} disabled={approveMutation.isPending || rejectMutation.isPending} className="flex-1 h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-60">
                  <Check className="h-4 w-4" /> Approve
                </button>
                <button onClick={() => rejectMutation.mutate({ orderId: selected.id, reason: note.trim() || "Rejected during approval review" })} disabled={approveMutation.isPending || rejectMutation.isPending} className="flex-1 h-10 rounded-md border border-destructive text-destructive text-sm font-medium hover:bg-destructive/10 flex items-center justify-center gap-2 disabled:opacity-60">
                  <X className="h-4 w-4" /> Reject
                </button>
              </div>
            ) : (
              <div className="px-6 py-4 border-t border-border text-center text-sm text-muted-foreground shrink-0">This order has already moved to <strong>{selected.status}</strong>.</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
