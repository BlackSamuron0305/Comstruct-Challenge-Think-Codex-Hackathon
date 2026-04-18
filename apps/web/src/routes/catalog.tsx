import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/dashboard/Layout";
import { catalog } from "@/lib/mock-data";
import { Upload, Sparkles, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/catalog")({
  head: () => ({
    meta: [
      { title: "Catalog · comstruct C-Materials" },
      { name: "description", content: "Normalized C-material catalog mapped from supplier Excel files, contracts and PunchOut feeds." },
    ],
  }),
  component: Catalog,
});

const CHF = (n: number) => new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", minimumFractionDigits: 2 }).format(n);

function Catalog() {
  const needsReview = catalog.filter((c) => c.status === "needs-review").length;

  return (
    <DashboardLayout title="Catalog" subtitle="Normalized C-material assortment across suppliers">
      {/* Import strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg border border-dashed border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 grid place-items-center rounded-md bg-primary text-primary-foreground"><Upload className="h-4 w-4" /></div>
            <div>
              <div className="font-medium text-sm">Upload Excel / CSV</div>
              <div className="text-xs text-muted-foreground">Map columns → SKU, price, unit</div>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-dashed border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 grid place-items-center rounded-md bg-hivis text-hivis-foreground"><Sparkles className="h-4 w-4" /></div>
            <div>
              <div className="font-medium text-sm">PDF contract extract</div>
              <div className="text-xs text-muted-foreground">AI parses framework prices</div>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 grid place-items-center rounded-md bg-warning/30 text-warning-foreground"><AlertCircle className="h-4 w-4" /></div>
            <div>
              <div className="font-medium text-sm tabular">{needsReview} items need review</div>
              <div className="text-xs text-muted-foreground">Auto-categorization low confidence</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground bg-secondary">
            <tr>
              <th className="text-left font-normal px-5 py-3">SKU</th>
              <th className="text-left font-normal px-5 py-3">Name</th>
              <th className="text-left font-normal px-5 py-3">Group</th>
              <th className="text-left font-normal px-5 py-3">Pack / Unit</th>
              <th className="text-left font-normal px-5 py-3">Supplier</th>
              <th className="text-right font-normal px-5 py-3">Price</th>
              <th className="text-left font-normal px-5 py-3">Mapping</th>
            </tr>
          </thead>
          <tbody>
            {catalog.map((c) => (
              <tr key={c.sku} className="border-t border-border hover:bg-secondary/60">
                <td className="px-5 py-3 text-mono text-xs">{c.sku}</td>
                <td className="px-5 py-3 font-medium">{c.name}</td>
                <td className="px-5 py-3 text-muted-foreground">{c.group}</td>
                <td className="px-5 py-3 text-muted-foreground text-xs">{c.pack} · <span className="text-mono">{c.unit}</span></td>
                <td className="px-5 py-3">{c.supplier}</td>
                <td className="px-5 py-3 text-right tabular">{CHF(c.price)}</td>
                <td className="px-5 py-3">
                  <span className={["text-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded",
                    c.status === "mapped" ? "bg-success/15 text-[oklch(0.42_0.13_155)]" : "bg-warning/30 text-warning-foreground"].join(" ")}>
                    {c.status === "mapped" ? "Mapped" : "Needs review"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
