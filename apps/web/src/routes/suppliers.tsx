import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/Layout";
import { suppliers } from "@/lib/mock-data";

export const Route = createFileRoute("/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers · comstruct C-Materials" },
      { name: "description", content: "C-material suppliers, integration channels and sync health." },
    ],
  }),
  component: Suppliers,
});

const CHF = (n: number) => new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(n);

const healthStyles = {
  good: "bg-success/15 text-[oklch(0.42_0.13_155)]",
  warn: "bg-warning/30 text-warning-foreground",
  bad:  "bg-destructive/10 text-destructive",
} as const;

function Suppliers() {
  return (
    <DashboardLayout title="Suppliers" subtitle="Integration channels & sync status">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {suppliers.map((s) => (
          <div key={s.id} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">{s.channel}</div>
                <h3 className="text-display text-lg font-semibold mt-1">{s.name}</h3>
              </div>
              <span className={["text-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded", healthStyles[s.health]].join(" ")}>
                {s.health === "good" ? "Healthy" : s.health === "warn" ? "Stale" : "Outdated"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-mono text-[10px] uppercase text-muted-foreground tracking-wider">Items</div>
                <div className="tabular font-medium">{s.items.toLocaleString("de-CH")}</div>
              </div>
              <div>
                <div className="text-mono text-[10px] uppercase text-muted-foreground tracking-wider">Spend MTD</div>
                <div className="tabular font-medium">{CHF(s.spend)}</div>
              </div>
              <div className="col-span-2">
                <div className="text-mono text-[10px] uppercase text-muted-foreground tracking-wider">Last sync</div>
                <div className="text-sm">{s.lastSync}</div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button className="text-sm flex-1 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Sync now</button>
              <button className="text-sm px-3 py-2 rounded-md border border-border hover:bg-accent">Settings</button>
            </div>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}
