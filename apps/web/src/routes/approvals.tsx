import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/Layout";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { useProject, ALL_PROJECTS } from "@/components/dashboard/ProjectContext";
import { approvals } from "@/lib/mock-data";
import { Check, X, Filter } from "lucide-react";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals · comstruct C-Materials" },
      { name: "description", content: "Review and approve foreman C-material orders against thresholds and framework contracts." },
    ],
  }),
  component: Approvals,
});

const CHF = (n: number) => new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(n);

const thresholdLabel = { auto: "Auto-approved", pm: "PM approval", central: "Central proc." } as const;

function Approvals() {
  const { project } = useProject();
  const rows = project === ALL_PROJECTS ? approvals : approvals.filter((a) => a.project === project);
  return (
    <DashboardLayout title="Approvals" subtitle={`${project === ALL_PROJECTS ? "All projects" : project} · Auto < CHF 200 · PM ≥ 200 · Central ≥ 500`}>
      <div className="flex items-center gap-2 mb-4">
        {["All", "Pending", "Auto", "PM approval", "Central"].map((f, i) => (
          <button key={f} className={["text-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-md border",
            i === 1 ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-accent"].join(" ")}>
            {f}
          </button>
        ))}
        <button className="ml-auto text-sm inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card hover:bg-accent">
          <Filter className="h-4 w-4" /> Filters
        </button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground bg-secondary">
            <tr>
              <th className="text-left font-normal px-5 py-3">Order</th>
              <th className="text-left font-normal px-5 py-3">Submitted</th>
              <th className="text-left font-normal px-5 py-3">Project</th>
              <th className="text-left font-normal px-5 py-3">Foreman</th>
              <th className="text-left font-normal px-5 py-3">Supplier</th>
              <th className="text-left font-normal px-5 py-3">Route</th>
              <th className="text-right font-normal px-5 py-3">Items</th>
              <th className="text-right font-normal px-5 py-3">Total</th>
              <th className="text-left font-normal px-5 py-3">Status</th>
              <th className="text-right font-normal px-5 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-t border-border hover:bg-secondary/60">
                <td className="px-5 py-3 text-mono text-xs">{a.orderRef}</td>
                <td className="px-5 py-3 text-muted-foreground text-xs">{a.submittedAt}</td>
                <td className="px-5 py-3">{a.project}</td>
                <td className="px-5 py-3 text-muted-foreground">{a.foreman}</td>
                <td className="px-5 py-3">{a.supplier}</td>
                <td className="px-5 py-3">
                  <span className="text-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-muted text-muted-foreground">
                    {thresholdLabel[a.threshold]}
                  </span>
                </td>
                <td className="px-5 py-3 text-right tabular">{a.items}</td>
                <td className="px-5 py-3 text-right tabular font-medium">{CHF(a.total)}</td>
                <td className="px-5 py-3"><StatusBadge status={a.status} /></td>
                <td className="px-5 py-3">
                  {a.status === "pending" ? (
                    <div className="flex justify-end gap-1.5">
                      <button className="h-8 w-8 grid place-items-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90" title="Approve">
                        <Check className="h-4 w-4" />
                      </button>
                      <button className="h-8 w-8 grid place-items-center rounded-md border border-border hover:bg-destructive/10 hover:text-destructive" title="Reject">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
