import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/Layout";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { useProject, ALL_PROJECTS } from "@/components/dashboard/ProjectContext";
import { orders } from "@/lib/mock-data";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Orders · comstruct C-Materials" },
      { name: "description", content: "All C-material orders across projects, suppliers and statuses." },
    ],
  }),
  component: Orders,
});

const CHF = (n: number) => new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(n);

function Orders() {
  const { project } = useProject();
  const rows = project === ALL_PROJECTS ? orders : orders.filter((o) => o.project === project);
  return (
    <DashboardLayout title="Orders" subtitle={project === ALL_PROJECTS ? "Every C-material order, end-to-end" : `Orders for ${project}`}>
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
            {rows.map((o) => (
              <tr key={o.id} className="border-t border-border hover:bg-secondary/60">
                <td className="px-5 py-3 text-mono text-xs">{o.ref}</td>
                <td className="px-5 py-3 text-muted-foreground text-xs">{o.date}</td>
                <td className="px-5 py-3">{o.project}</td>
                <td className="px-5 py-3 text-muted-foreground">{o.foreman}</td>
                <td className="px-5 py-3">{o.supplier}</td>
                <td className="px-5 py-3 text-right tabular">{o.items}</td>
                <td className="px-5 py-3 text-right tabular font-medium">{CHF(o.total)}</td>
                <td className="px-5 py-3"><StatusBadge status={o.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
