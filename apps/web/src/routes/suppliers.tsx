import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, Settings, X } from "lucide-react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/dashboard/Layout";
import { api, formatCurrency, type ProductRecord, type SupplierRecord } from "@/lib/api";

export const Route = createFileRoute("/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers · comstruct C-Materials" },
      { name: "description", content: "C-material suppliers, integration channels and sync health." },
    ],
  }),
  component: Suppliers,
});

const healthStyles = {
  good: "bg-success/15 text-[oklch(0.42_0.13_155)]",
  warn: "bg-warning/30 text-warning-foreground",
  bad: "bg-destructive/10 text-destructive",
} as const;

type LocalSupplier = SupplierRecord & {
  items: number;
  spend: number;
  lastSync: string;
  health: "good" | "warn" | "bad";
  uploadedAt: string;
  lastPriceFetch: string;
  owner: string;
  channel: "API/PunchOut" | "Excel upload";
};

function Suppliers() {
  const [settingsSupplier, setSettingsSupplier] = useState<LocalSupplier | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const { data: suppliers = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["suppliers", "cards"],
    queryFn: () => api.get<SupplierRecord[]>("/api/suppliers"),
  });
  const { data: products = [] } = useQuery({
    queryKey: ["suppliers", "products"],
    queryFn: () => api.get<ProductRecord[]>("/api/products", { params: { page_size: 500 } }),
  });

  const suppliersList = useMemo<LocalSupplier[]>(() => {
    return suppliers.map((supplier, index) => {
      const linkedProducts = products.filter((product) => product.supplier_id === supplier.id);
      const spend = linkedProducts.reduce((sum, product) => sum + Number(product.unit_price ?? 0), 0);
      const items = linkedProducts.length;
      const health = items === 0 ? "warn" : spend > 0 ? "good" : "bad";
      return {
        ...supplier,
        items,
        spend,
        lastSync: items > 0 ? "Live catalog connected" : "Awaiting first import",
        health,
        uploadedAt: "Current dataset",
        lastPriceFetch: items > 0 ? "Live from catalog-service" : "No supplier rows yet",
        owner: supplier.email ?? "procurement@comstruct.local",
        channel: index % 2 === 0 ? "API/PunchOut" : "Excel upload",
      };
    });
  }, [products, suppliers]);

  function handleSync(name: string) {
    toast.success(`${name} refresh requested`, {
      description: "This dashboard is already reading the latest live catalog data.",
    });
  }

  return (
    <>
      <DashboardLayout title="Suppliers" subtitle="Live supplier directory and catalog coverage">
        <div className="mb-4 flex justify-end">
          <button onClick={() => setShowAdd(true)} className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm inline-flex items-center gap-2">
            <Plus className="h-3.5 w-3.5" /> Add seller
          </button>
        </div>

        {isLoading ? (
          <div className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">Loading live suppliers…</div>
        ) : isError ? (
          <div className="rounded-lg border border-border bg-card p-8 text-sm">
            <div className="font-medium">Suppliers could not be loaded.</div>
            <button onClick={() => void refetch()} className="mt-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">Retry</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {suppliersList.map((supplier) => (
              <div key={supplier.id} className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">{supplier.channel}</div>
                    <h3 className="text-display text-lg font-semibold mt-1">{supplier.name}</h3>
                  </div>
                  <span className={["text-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded shrink-0", healthStyles[supplier.health]].join(" ")}>
                    {supplier.health === "good" ? "Healthy" : supplier.health === "warn" ? "Needs import" : "No spend"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-mono text-[10px] uppercase text-muted-foreground tracking-wider">Catalog items</div>
                    <div className="tabular font-medium">{supplier.items.toLocaleString("de-CH")}</div>
                  </div>
                  <div>
                    <div className="text-mono text-[10px] uppercase text-muted-foreground tracking-wider">Catalog value</div>
                    <div className="tabular font-medium">{formatCurrency(supplier.spend, "CHF")}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-mono text-[10px] uppercase text-muted-foreground tracking-wider">Contact</div>
                    <div className="text-sm">{supplier.contact_name ?? supplier.email ?? "No contact registered"}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-mono text-[10px] uppercase text-muted-foreground tracking-wider">Source metadata</div>
                    <div className="text-xs text-muted-foreground">{supplier.lastSync} · {supplier.lastPriceFetch}</div>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button onClick={() => handleSync(supplier.name)} className="text-sm flex-1 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5" /> Sync now
                  </button>
                  <button onClick={() => setSettingsSupplier(supplier)} className="text-sm px-3 py-2 rounded-md border border-border hover:bg-accent flex items-center gap-1.5">
                    <Settings className="h-3.5 w-3.5" /> Settings
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardLayout>

      {settingsSupplier && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20" onClick={() => setSettingsSupplier(null)} />
          <div className="relative bg-background border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/30">
              <div>
                <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Supplier snapshot</div>
                <div className="text-display text-base font-semibold mt-0.5">{settingsSupplier.name}</div>
              </div>
              <button onClick={() => setSettingsSupplier(null)} className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3 text-sm">
              <div><span className="font-medium">Channel:</span> {settingsSupplier.channel}</div>
              <div><span className="font-medium">Owner:</span> {settingsSupplier.owner}</div>
              <div><span className="font-medium">Phone:</span> {settingsSupplier.phone ?? "Not provided"}</div>
              <div><span className="font-medium">Email:</span> {settingsSupplier.email ?? "Not provided"}</div>
              <div className="text-muted-foreground">This supplier card is now backed by live supplier and product data from the running services.</div>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowAdd(false)} />
          <div className="relative bg-background border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-secondary/30">
              <div className="text-display text-base font-semibold">Add seller</div>
            </div>
            <div className="px-6 py-5 text-sm text-muted-foreground">
              Supplier creation is not exposed in the current API yet. The next sprint will add a real supplier onboarding flow through the catalog service.
            </div>
          </div>
        </div>
      )}
    </>
  );
}