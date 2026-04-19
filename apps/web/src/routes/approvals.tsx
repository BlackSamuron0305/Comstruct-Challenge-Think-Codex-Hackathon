import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/Layout";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { useProject, ALL_PROJECTS } from "@/components/dashboard/ProjectContext";
import { approvals as rawApprovals, type Approval } from "@/lib/mock-data";
import {
  Check,
  X,
  Filter,
  Package,
  Building2,
  User,
  AlertTriangle,
  ShieldAlert,
  Sigma,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals · comstruct C-Materials" },
      {
        name: "description",
        content:
          "Review and approve foreman C-material orders against thresholds and framework contracts.",
      },
    ],
  }),
  component: Approvals,
});

const CHF = (n: number) =>
  new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(n);

const thresholdLabel = {
  auto: "Auto-approved",
  pm: "PM approval",
  central: "Central proc.",
} as const;

const thresholdColors = {
  auto: "bg-success/15 text-[oklch(0.42_0.13_155)]",
  pm: "bg-warning/30 text-warning-foreground",
  central: "bg-destructive/10 text-destructive",
} as const;

// Detailed line items per approval
const lineItemsMap: Record<
  string,
  { sku: string; name: string; qty: number; unit: string; unitPrice: number }[]
> = {
  a1: [
    {
      sku: "WUR-0042-45",
      name: "Spanplattenschraube Torx 4.5×40",
      qty: 500,
      unit: "pc",
      unitPrice: 0.06,
    },
    { sku: "WUR-0091-30", name: "Dübel Nylon UX 8×50", qty: 200, unit: "pc", unitPrice: 0.18 },
    {
      sku: "HIL-TAPE-19",
      name: "Gewebeband silber 19mm × 50m",
      qty: 10,
      unit: "rl",
      unitPrice: 5.4,
    },
    { sku: "WUR-BAT-AA", name: "Batterie Alkaline AA", qty: 48, unit: "pc", unitPrice: 0.65 },
  ],
  a3: [
    {
      sku: "HIL-TAPE-19",
      name: "Gewebeband silber 19mm × 50m",
      qty: 20,
      unit: "rl",
      unitPrice: 5.4,
    },
    { sku: "DEB-DR-6", name: "Bohrer SDS-Plus 6×160", qty: 80, unit: "pc", unitPrice: 4.2 },
    { sku: "WUR-0091-30", name: "Dübel Nylon UX 8×50", qty: 200, unit: "pc", unitPrice: 0.18 },
  ],
  a4: [
    { sku: "DEB-DR-6", name: "Bohrer SDS-Plus 6×160", qty: 50, unit: "pc", unitPrice: 4.2 },
    {
      sku: "WUR-0042-45",
      name: "Spanplattenschraube Torx 4.5×40",
      qty: 800,
      unit: "pc",
      unitPrice: 0.06,
    },
    { sku: "WUR-0091-30", name: "Dübel Nylon UX 8×50", qty: 300, unit: "pc", unitPrice: 0.18 },
    { sku: "WUR-BAT-AA", name: "Batterie Alkaline AA", qty: 48, unit: "pc", unitPrice: 0.65 },
  ],
  a6: [
    { sku: "PUA-FOAM-1", name: "PU-Schaum 750ml Standard", qty: 60, unit: "can", unitPrice: 6.8 },
    {
      sku: "PUA-SIL-310",
      name: "Silikon sanitär weiss 310ml",
      qty: 80,
      unit: "tb",
      unitPrice: 4.1,
    },
    {
      sku: "HG-PPE-G09",
      name: "Arbeitshandschuhe Nitril Gr. 9",
      qty: 48,
      unit: "pr",
      unitPrice: 1.9,
    },
    { sku: "HG-PPE-M01", name: "FFP2 Atemschutzmaske", qty: 80, unit: "pc", unitPrice: 0.85 },
  ],
  a8: [
    {
      sku: "HIL-TAPE-19",
      name: "Gewebeband silber 19mm × 50m",
      qty: 12,
      unit: "rl",
      unitPrice: 5.4,
    },
    { sku: "DEB-DR-6", name: "Bohrer SDS-Plus 6×160", qty: 40, unit: "pc", unitPrice: 4.2 },
  ],
};

const quantityHistory: Record<string, number[]> = {
  "WUR-0042-45": [120, 180, 220, 260, 300, 340],
  "WUR-0091-30": [80, 120, 150, 170, 190, 220],
  "PUA-FOAM-1": [4, 6, 8, 10, 12, 12],
  "HG-PPE-G09": [12, 24, 24, 36, 48, 60],
  "DEB-DR-6": [10, 20, 20, 25, 30, 35],
};

const thresholdExplanation: Record<string, string> = {
  pm: "This order exceeds CHF 200 and requires PM sign-off before the purchase is placed with the supplier. Verify the quantities are correct and the supplier is on the approved framework.",
  central:
    "This order exceeds CHF 500 and must be reviewed by Central Procurement to ensure compliance with the annual budget and framework contract conditions.",
  auto: "This order was below the CHF 200 auto-approval threshold and has been automatically approved.",
};

const foremanContext: Record<
  string,
  { role: string; todaySpend: number; ordersToday: number; dailyLimit: number }
> = {
  "M. Keller": {
    role: "Site foreman – Letzigrund Tower B",
    todaySpend: 312.4,
    ordersToday: 2,
    dailyLimit: 400,
  },
  "A. Brunner": {
    role: "Site foreman – Sihlcity Refit",
    todaySpend: 452.0,
    ordersToday: 3,
    dailyLimit: 250,
  },
  "L. Studer": {
    role: "Site foreman – Hardbrücke Depot",
    todaySpend: 583.3,
    ordersToday: 4,
    dailyLimit: 300,
  },
  "R. Frei": {
    role: "Site foreman – Oerlikon School",
    todaySpend: 921.5,
    ordersToday: 2,
    dailyLimit: 200,
  },
};

const FILTERS = ["All", "Pending", "Auto", "PM approval", "Central"] as const;

function Approvals() {
  const { project } = useProject();
  const [items, setItems] = useState(rawApprovals);
  const [activeFilter, setActiveFilter] = useState<string>("Pending");
  const [selected, setSelected] = useState<Approval | null>(null);
  const [note, setNote] = useState("");

  const filterFn = (a: Approval) => {
    if (project !== ALL_PROJECTS && a.project !== project) return false;
    if (activeFilter === "Pending") return a.status === "pending";
    if (activeFilter === "Auto") return a.threshold === "auto";
    if (activeFilter === "PM approval") return a.threshold === "pm";
    if (activeFilter === "Central") return a.threshold === "central";
    return true;
  };

  const rows = items.filter(filterFn);

  const act = (id: string, action: "approved" | "rejected") => {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, status: action } : a)));
    const order = items.find((a) => a.id === id);
    setSelected(null);
    setNote("");
    if (action === "approved") {
      toast.success(`Order ${order?.orderRef} approved`, {
        description: "The supplier will be notified to process the order.",
      });
    } else {
      toast.error(`Order ${order?.orderRef} rejected`, {
        description: "The foreman will be notified with the rejection reason.",
      });
    }
  };

  const selectedStats = (lineItemsMap[selected?.id || ""] ?? []).map((li) => {
    const hist = quantityHistory[li.sku] ?? [10, 20, 30, 40];
    const mean = hist.reduce((a, b) => a + b, 0) / hist.length;
    const variance = hist.reduce((acc, v) => acc + (v - mean) ** 2, 0) / hist.length;
    const std = Math.sqrt(variance) || 1;
    const z = (li.qty - mean) / std;
    return { ...li, mean, std, z, flagged: li.qty > mean + 2 * std };
  });

  return (
    <>
      <DashboardLayout
        title="Approvals"
        subtitle={`${project === ALL_PROJECTS ? "All projects" : project} · Auto < CHF 200 · PM ≥ 200 · Central ≥ 500`}
      >
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={[
                "text-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-md border",
                activeFilter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border hover:bg-accent",
              ].join(" ")}
            >
              {f}
            </button>
          ))}
          <button className="ml-auto text-sm inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card hover:bg-accent">
            <Filter className="h-4 w-4" /> Filters
          </button>
        </div>

        {/* overflow-x-auto ensures full horizontal scroll */}
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
                <th className="text-right font-normal px-5 py-3 whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr
                  key={a.id}
                  className={[
                    "border-t border-border hover:bg-secondary/60 cursor-pointer",
                    selected?.id === a.id ? "bg-secondary/80" : "",
                  ].join(" ")}
                  onClick={() => {
                    setSelected(a);
                    setNote("");
                  }}
                >
                  <td className="px-5 py-3 text-mono text-xs whitespace-nowrap">{a.orderRef}</td>
                  <td className="px-5 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {a.submittedAt}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">{a.project}</td>
                  <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">{a.foreman}</td>
                  <td className="px-5 py-3 whitespace-nowrap">{a.supplier}</td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span
                      className={[
                        "text-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded",
                        thresholdColors[a.threshold],
                      ].join(" ")}
                    >
                      {thresholdLabel[a.threshold]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular whitespace-nowrap">{a.items}</td>
                  <td className="px-5 py-3 text-right tabular font-medium whitespace-nowrap">
                    {CHF(a.total)}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    {a.status === "pending" ? (
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            act(a.id, "approved");
                          }}
                          className="h-8 w-8 grid place-items-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                          title="Approve"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            act(a.id, "rejected");
                          }}
                          className="h-8 w-8 grid place-items-center rounded-md border border-border hover:bg-destructive/10 hover:text-destructive"
                          title="Reject"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground text-right block">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    No orders match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DashboardLayout>

      {/* Detail review panel */}
      {selected && (
        <div className="fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/20" onClick={() => setSelected(null)} />

          {/* Panel */}
          <div className="w-[500px] max-w-full bg-background border-l border-border flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/30 shrink-0">
              <div>
                <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Order review
                </div>
                <div className="text-display text-lg font-semibold mt-0.5">{selected.orderRef}</div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={[
                    "text-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded",
                    thresholdColors[selected.threshold],
                  ].join(" ")}
                >
                  {thresholdLabel[selected.threshold]}
                </span>
                <button
                  onClick={() => setSelected(null)}
                  className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent ml-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Approval reason */}
              {(selected.threshold === "pm" || selected.threshold === "central") &&
                selected.status === "pending" && (
                  <div
                    className={[
                      "rounded-md p-4 border",
                      selected.threshold === "central"
                        ? "bg-destructive/10 border-destructive/20"
                        : "bg-warning/10 border-warning/20",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-2.5">
                      {selected.threshold === "central" ? (
                        <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-warning-foreground mt-0.5 shrink-0" />
                      )}
                      <div>
                        <div
                          className={[
                            "text-sm font-semibold",
                            selected.threshold === "central"
                              ? "text-destructive"
                              : "text-warning-foreground",
                          ].join(" ")}
                        >
                          {thresholdLabel[selected.threshold]} required
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {thresholdExplanation[selected.threshold]}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              {/* Order meta */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                    Project
                  </div>
                  <div className="font-medium">{selected.project}</div>
                </div>
                <div>
                  <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                    Submitted
                  </div>
                  <div>{selected.submittedAt}</div>
                </div>
              </div>

              {/* Foreman */}
              <div className="rounded-md border border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    From · Foreman
                  </div>
                </div>
                <div className="font-semibold text-base">{selected.foreman}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {foremanContext[selected.foreman]?.role ?? "Site foreman"}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-xs border-t border-border pt-3">
                  <div>
                    <div className="text-muted-foreground mb-0.5">Spend today</div>
                    <div className="font-semibold tabular">
                      {CHF(foremanContext[selected.foreman]?.todaySpend ?? selected.total)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-0.5">Daily limit</div>
                    <div className="font-semibold tabular">
                      {CHF(foremanContext[selected.foreman]?.dailyLimit ?? 250)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-0.5">Orders today</div>
                    <div className="font-semibold">
                      {foremanContext[selected.foreman]?.ordersToday ?? 1}
                    </div>
                  </div>
                </div>
              </div>

              {/* Supplier */}
              <div className="rounded-md border border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    To · Supplier
                  </div>
                </div>
                <div className="font-semibold text-base">{selected.supplier}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Framework contract · C-materials procurement
                </div>
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Line items · {selected.items} positions
                  </div>
                </div>
                <div className="rounded-md border border-border p-3 mt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Sigma className="h-4 w-4 text-primary" />
                    <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Quantity anomaly check (Standardabweichung)
                    </div>
                  </div>
                  <div className="space-y-2">
                    {selectedStats.map((s) => (
                      <div
                        key={s.sku}
                        className={[
                          "rounded-md border px-3 py-2 text-xs",
                          s.flagged
                            ? "border-warning/40 bg-warning/20"
                            : "border-success/30 bg-success/10",
                        ].join(" ")}
                      >
                        <div className="font-medium">{s.name}</div>
                        <div className="text-muted-foreground">
                          qty {s.qty} · avg {s.mean.toFixed(1)} · std {s.std.toFixed(1)} · z{" "}
                          {s.z.toFixed(2)}
                        </div>
                      </div>
                    ))}
                    {selectedStats.length === 0 && (
                      <div className="text-xs text-muted-foreground">
                        No line-item history signals.
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary text-muted-foreground">
                      <tr>
                        <th className="text-left font-normal px-3 py-2">SKU</th>
                        <th className="text-left font-normal px-3 py-2">Description</th>
                        <th className="text-right font-normal px-3 py-2">Qty</th>
                        <th className="text-right font-normal px-3 py-2">Unit price</th>
                        <th className="text-right font-normal px-3 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(lineItemsMap[selected.id] ?? []).map((li, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-3 py-2 font-mono">{li.sku}</td>
                          <td className="px-3 py-2">{li.name}</td>
                          <td className="px-3 py-2 text-right tabular">
                            {li.qty} {li.unit}
                          </td>
                          <td className="px-3 py-2 text-right tabular">{CHF(li.unitPrice)}</td>
                          <td className="px-3 py-2 text-right tabular font-medium">
                            {CHF(li.qty * li.unitPrice)}
                          </td>
                        </tr>
                      ))}
                      {!lineItemsMap[selected.id] && (
                        <tr>
                          <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                            Detailed line items not available for this order.
                          </td>
                        </tr>
                      )}
                      <tr className="border-t-2 border-border bg-secondary/50 font-semibold text-sm">
                        <td colSpan={4} className="px-3 py-2.5 text-right">
                          Order total
                        </td>
                        <td className="px-3 py-2.5 text-right tabular">{CHF(selected.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Note */}
              {selected.status === "pending" && (
                <div>
                  <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Decision note (optional)
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add context or reason for your decision…"
                    rows={3}
                    className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </div>
              )}
            </div>

            {/* Footer actions */}
            {selected.status === "pending" ? (
              <div className="px-6 py-4 border-t border-border flex gap-3 shrink-0 bg-background">
                <button
                  onClick={() => act(selected.id, "approved")}
                  className="flex-1 h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 flex items-center justify-center gap-2"
                >
                  <Check className="h-4 w-4" /> Approve
                </button>
                <button
                  onClick={() => act(selected.id, "rejected")}
                  className="flex-1 h-10 rounded-md border border-destructive text-destructive text-sm font-medium hover:bg-destructive/10 flex items-center justify-center gap-2"
                >
                  <X className="h-4 w-4" /> Reject
                </button>
              </div>
            ) : (
              <div className="px-6 py-4 border-t border-border text-center text-sm text-muted-foreground shrink-0">
                This order has been <strong>{selected.status}</strong>.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
