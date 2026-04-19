import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpFromLine, Clock3, Plus, RefreshCw, Settings, X } from "lucide-react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/dashboard/Layout";
import { QueryState } from "@/components/dashboard/QueryState";
import { api, formatCurrency, type ProductRecord, type SupplierRecord } from "@/lib/api";

export const Route = createFileRoute("/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers · comstruct C-Materials" },
      {
        name: "description",
        content: "C-material suppliers, integration channels and sync health.",
      },
    ],
  }),
  component: Suppliers,
});

type SupplierChannel = "API/PunchOut" | "Excel/PDF upload";

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
  const queryClient = useQueryClient();
  const [settingsSupplier, setSettingsSupplier] = useState<SupplierCard | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftContact, setDraftContact] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftPhone, setDraftPhone] = useState("");

  const {
    data: suppliers = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["suppliers", "cards"],
    queryFn: () => api.get<SupplierRecord[]>("/api/suppliers"),
  });
  const { data: products = [] } = useQuery({
    queryKey: ["suppliers", "products"],
    queryFn: () => api.get<ProductRecord[]>("/api/products", { params: { page_size: 500 } }),
  });

  const createSupplierMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      contact_name?: string;
      email?: string;
      phone?: string;
    }) => api.post<SupplierRecord>("/api/suppliers", payload),
    onSuccess: (created) => {
      toast.success(`${created.name} saved to the supplier database.`);
      setShowAdd(false);
      resetDraft();
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      void queryClient.invalidateQueries({ queryKey: ["catalog-suppliers"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Supplier could not be saved.");
    },
  });

  const suppliersList = useMemo<SupplierCard[]>(() => {
    function toCard(supplier: SupplierRecord): SupplierCard {
      const linkedProducts = products.filter((product) => product.supplier_id === supplier.id);
      const spend = linkedProducts.reduce(
        (sum, product) => sum + Number(product.unit_price ?? 0),
        0,
      );
      const items = linkedProducts.length;
      const autoSync = items > 0;
      const channel: SupplierChannel = autoSync ? "API/PunchOut" : "Excel/PDF upload";

      return {
        ...supplier,
        items,
        spend,
        owner: supplier.email ?? "procurement@comstruct.local",
        channel,
        autoSync,
        actionLabel: autoSync ? "Refresh view" : "Upload catalog",
        statusLabel: autoSync ? "Live catalog" : "Needs import",
        statusTone: autoSync ? "good" : "warn",
        integrationNotes: autoSync
          ? "This supplier already has live catalog items in the database."
          : "This supplier is stored in the database and is ready for its first catalog import.",
        lastActivity: autoSync
          ? "Live catalog data is available now"
          : "Waiting for the first uploaded price list",
      };
    }

    return [...suppliers].map(toCard).sort((left, right) => left.name.localeCompare(right.name));
  }, [products, suppliers]);

  const liveCount = suppliersList.filter((supplier) => supplier.autoSync).length;
  const readyForImportCount = suppliersList.filter((supplier) => !supplier.autoSync).length;
  const totalCatalogValue = suppliersList.reduce((sum, supplier) => sum + supplier.spend, 0);

  function resetDraft() {
    setDraftName("");
    setDraftContact("");
    setDraftEmail("");
    setDraftPhone("");
  }

  function handleCreateSupplier() {
    if (!draftName.trim()) {
      toast.error("Please enter a supplier name.");
      return;
    }

    createSupplierMutation.mutate({
      name: draftName.trim(),
      contact_name: draftContact.trim() || undefined,
      email: draftEmail.trim() || undefined,
      phone: draftPhone.trim() || undefined,
    });
  }

  function handleSupplierAction(supplier: SupplierCard) {
    if (supplier.autoSync) {
      toast.success(`${supplier.name} sync requested`, {
        description:
          "API suppliers can be refreshed on demand and also auto-sync in the background.",
      });
      return;
    }

    toast.success(`Open the catalog import to upload the newest PDF/Excel for ${supplier.name}.`);
    void navigate({ to: "/catalog" });
  }

  return (
    <>
      <DashboardLayout
        title="Suppliers"
        subtitle="Supplier directory, sync model, and latest commercial source data"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Every supplier shown here now comes from the live database.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm inline-flex items-center gap-2"
          >
            <Plus className="h-3.5 w-3.5" /> Add supplier
          </button>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Live catalogs</div>
            <div className="mt-1 text-2xl font-semibold">{liveCount}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Ready for first import</div>
            <div className="mt-1 text-2xl font-semibold">{readyForImportCount}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">Current catalog value</div>
            <div className="mt-1 text-2xl font-semibold">
              {formatCurrency(totalCatalogValue, "EUR")}
            </div>
          </div>
        </div>

        {readyForImportCount > 0 && (
          <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
            <div className="font-medium text-warning-foreground">
              Some suppliers are stored but still need a first file import.
            </div>
            <div className="mt-1 text-muted-foreground">
              Open the catalog workspace to upload their first PDF, CSV, or Excel price list.
            </div>
          </div>
        )}

        {isLoading ? (
          <QueryState
            kind="loading"
            title="Loading live suppliers"
            description="API suppliers and uploaded file sources are being prepared now."
          />
        ) : isError ? (
          <QueryState
            kind="error"
            title="Suppliers could not be loaded"
            description="The supplier directory is temporarily unavailable."
            onRetry={() => void refetch()}
          />
        ) : suppliersList.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-sm">
            <div className="font-medium">No suppliers are connected yet.</div>
            <div className="mt-1 text-muted-foreground">
              Add a supplier first, then import a PDF, CSV, or Excel price list from the catalog
              workspace.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {suppliersList.map((supplier) => (
              <div
                key={supplier.id}
                role="button"
                tabIndex={0}
                onClick={() => setSettingsSupplier(supplier)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSettingsSupplier(supplier);
                  }
                }}
                className="rounded-lg border border-border bg-card p-5 text-left hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {supplier.channel}
                    </div>
                    <h3 className="text-display text-lg font-semibold mt-1">{supplier.name}</h3>
                  </div>
                  <span
                    className={[
                      "text-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded shrink-0",
                      statusStyles[supplier.statusTone],
                    ].join(" ")}
                  >
                    {supplier.statusLabel}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-mono text-[10px] uppercase text-muted-foreground tracking-wider">
                      Catalog items
                    </div>
                    <div className="tabular font-medium">
                      {supplier.items.toLocaleString("de-CH")}
                    </div>
                  </div>
                  <div>
                    <div className="text-mono text-[10px] uppercase text-muted-foreground tracking-wider">
                      Catalog value
                    </div>
                    <div className="tabular font-medium">
                      {formatCurrency(supplier.spend, "EUR")}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-mono text-[10px] uppercase text-muted-foreground tracking-wider">
                      Contact
                    </div>
                    <div className="text-sm">
                      {supplier.contact_name ?? supplier.email ?? "No contact registered"}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-mono text-[10px] uppercase text-muted-foreground tracking-wider">
                      Integration model
                    </div>
                    <div className="text-xs text-muted-foreground">{supplier.integrationNotes}</div>
                  </div>
                  <div className="col-span-2 rounded-md bg-secondary/40 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                    <Clock3 className="h-3.5 w-3.5" /> {supplier.lastActivity}
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleSupplierAction(supplier);
                    }}
                    className="text-sm flex-1 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2"
                  >
                    {supplier.autoSync ? (
                      <RefreshCw className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowUpFromLine className="h-3.5 w-3.5" />
                    )}
                    {supplier.actionLabel}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSettingsSupplier(supplier);
                    }}
                    className="text-sm px-3 py-2 rounded-md border border-border hover:bg-accent flex items-center gap-1.5"
                  >
                    <Settings className="h-3.5 w-3.5" /> Details
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
                <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Supplier snapshot
                </div>
                <div className="text-display text-base font-semibold mt-0.5">
                  {settingsSupplier.name}
                </div>
              </div>
              <button
                onClick={() => setSettingsSupplier(null)}
                className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3 text-sm">
              <div>
                <span className="font-medium">Channel:</span> {settingsSupplier.channel}
              </div>
              <div>
                <span className="font-medium">Owner:</span> {settingsSupplier.owner}
              </div>
              <div>
                <span className="font-medium">Phone:</span>{" "}
                {settingsSupplier.phone ?? "Not provided"}
              </div>
              <div>
                <span className="font-medium">Email:</span>{" "}
                {settingsSupplier.email ?? "Not provided"}
              </div>
              <div>
                <span className="font-medium">Current mode:</span>{" "}
                {settingsSupplier.autoSync
                  ? "API auto-sync with optional manual refresh"
                  : "Manual PDF/Excel refresh when a new file arrives"}
              </div>
              <div className="text-muted-foreground">{settingsSupplier.lastActivity}</div>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowAdd(false)} />
          <div className="relative bg-background border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-secondary/30">
              <div className="text-display text-base font-semibold">Add supplier</div>
            </div>
            <div className="px-6 py-5 space-y-3 text-sm">
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Supplier name"
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
              <input
                value={draftContact}
                onChange={(event) => setDraftContact(event.target.value)}
                placeholder="Contact person"
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
              <input
                value={draftEmail}
                onChange={(event) => setDraftEmail(event.target.value)}
                placeholder="Email"
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
              <input
                value={draftPhone}
                onChange={(event) => setDraftPhone(event.target.value)}
                placeholder="Phone"
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowAdd(false)}
                  className="rounded-md border border-border px-3 py-2 hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateSupplier}
                  disabled={createSupplierMutation.isPending}
                  className="rounded-md bg-primary px-3 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {createSupplierMutation.isPending ? "Saving…" : "Save supplier"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
