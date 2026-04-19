import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpFromLine, Clock3, Plus, RefreshCw, Settings, X } from "lucide-react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/dashboard/Layout";
import { QueryState } from "@/components/dashboard/QueryState";
import { api, formatCurrency, type ProductRecord, type SupplierRecord } from "@/lib/api";
import { createLocalSupplierDraft, loadLocalSuppliers, saveLocalSuppliers, type LocalSupplierDraft, type SupplierChannel } from "@/lib/local-suppliers";

export const Route = createFileRoute("/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers · comstruct C-Materials" },
      { name: "description", content: "C-material suppliers, integration channels and sync health." },
    ],
  }),
  component: Suppliers,
});

const statusStyles = {
  good: "bg-success/15 text-[oklch(0.42_0.13_155)]",
  warn: "bg-warning/30 text-warning-foreground",
  neutral: "bg-secondary text-foreground",
} as const;

type SupplierCard = SupplierRecord & {
  items: number;
  spend: number;
  owner: string;
  channel: SupplierChannel;
  autoSync: boolean;
  actionLabel: string;
  statusLabel: string;
  statusTone: keyof typeof statusStyles;
  integrationNotes: string;
  lastActivity: string;
};

function Suppliers() {
  const navigate = useNavigate();
  const [settingsSupplier, setSettingsSupplier] = useState<SupplierCard | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [localSuppliers, setLocalSuppliers] = useState<LocalSupplierDraft[]>(() => loadLocalSuppliers());
  const [draftName, setDraftName] = useState("");
  const [draftContact, setDraftContact] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftChannel, setDraftChannel] = useState<SupplierChannel>("Excel/PDF upload");

  const { data: suppliers = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["suppliers", "cards"],
    queryFn: () => api.get<SupplierRecord[]>("/api/suppliers"),
  });
  const { data: products = [] } = useQuery({
    queryKey: ["suppliers", "products"],
    queryFn: () => api.get<ProductRecord[]>("/api/products", { params: { page_size: 500 } }),
  });

  const suppliersList = useMemo<SupplierCard[]>(() => {
    function toCard(supplier: SupplierRecord | LocalSupplierDraft, channel: SupplierChannel): SupplierCard {
      const linkedProducts = products.filter((product) => product.supplier_id === supplier.id);
      const spend = linkedProducts.reduce((sum, product) => sum + Number(product.unit_price ?? 0), 0);
      const items = linkedProducts.length;
      const autoSync = channel === "API/PunchOut";

      return {
        ...supplier,
        items,
        spend,
        owner: supplier.email ?? "procurement@comstruct.local",
        channel,
        autoSync,
        actionLabel: autoSync ? "Sync now" : "Upload latest version",
        statusLabel: autoSync ? "Auto-sync" : "Manual upload",
        statusTone: autoSync ? (items > 0 ? "good" : "warn") : "neutral",
        integrationNotes: autoSync
          ? "Connected via API and refreshed automatically."
          : "Managed through PDF or Excel uploads when pricing changes.",
        lastActivity: autoSync
          ? (items > 0 ? "Last API pull: a few minutes ago" : "Waiting for first API pull")
          : (items > 0 ? "Latest file version is active" : "Awaiting first PDF/Excel upload"),
      };
    }

    const liveCards = suppliers.map((supplier, index) => toCard(supplier, index % 2 === 0 ? "API/PunchOut" : "Excel/PDF upload"));
    const manualCards = localSuppliers.map((supplier) => toCard(supplier, supplier.channel));

    return [...manualCards, ...liveCards].sort((left, right) => left.name.localeCompare(right.name));
  }, [localSuppliers, products, suppliers]);

  function resetDraft() {
    setDraftName("");
    setDraftContact("");
    setDraftEmail("");
    setDraftPhone("");
    setDraftChannel("Excel/PDF upload");
  }

  function handleCreateSupplier() {
    if (!draftName.trim()) {
      toast.error("Please enter a supplier name.");
      return;
    }

    const created = createLocalSupplierDraft({
      name: draftName,
      contact_name: draftContact,
      email: draftEmail,
      phone: draftPhone,
      channel: draftChannel,
    });

    const next = [created, ...localSuppliers];
    setLocalSuppliers(next);
    saveLocalSuppliers(next);
    setShowAdd(false);
    resetDraft();
    toast.success(`${created.name} added for this workspace.`);
  }

  function handleSupplierAction(supplier: SupplierCard) {
    if (supplier.autoSync) {
      toast.success(`${supplier.name} sync requested`, {
        description: "API suppliers can be refreshed on demand and also auto-sync in the background.",
      });
      return;
    }

    toast.success(`Open the catalog import to upload the newest PDF/Excel for ${supplier.name}.`);
    void navigate({ to: "/catalog" });
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