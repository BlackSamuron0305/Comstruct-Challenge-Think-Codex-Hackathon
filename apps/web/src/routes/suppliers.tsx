import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/Layout";
import { suppliers as rawSuppliers, type Supplier } from "@/lib/mock-data";
import { RefreshCw, Settings, X, Save, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers · comstruct C-Materials" },
      { name: "description", content: "C-material suppliers, integration channels and sync health." },
    ],
  }),
  component: Suppliers,
});

const CHF = (n: number) =>
  new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(n);

const healthStyles = {
  good: "bg-success/15 text-[oklch(0.42_0.13_155)]",
  warn: "bg-warning/30 text-warning-foreground",
  bad:  "bg-destructive/10 text-destructive",
} as const;

const SYNC_INTERVALS = ["15 min", "1 hour", "Daily", "Manual"] as const;

type SettingsForm = {
  syncInterval: string;
  notificationEmail: string;
  webhookUrl: string;
  autoReorder: boolean;
};

type LocalSupplier = Supplier & {
  uploadedAt: string;
  lastPriceFetch: string;
  owner: string;
};

function Suppliers() {
  const [suppliersList, setSuppliersList] = useState<LocalSupplier[]>(rawSuppliers.map((s) => ({
    ...s,
    uploadedAt: "2026-04-18 10:20",
    lastPriceFetch: s.channel === "API/PunchOut" ? "2026-04-19 00:42" : "Manual upload",
    owner: "procurement@comstruct.eu",
  })));
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const [settingsSupplier, setSettingsSupplier] = useState<LocalSupplier | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newOwner, setNewOwner] = useState("procurement@comstruct.eu");
  const [newChannel, setNewChannel] = useState<Supplier["channel"]>("Excel upload");
  const [form, setForm] = useState<SettingsForm>({
    syncInterval: "Daily",
    notificationEmail: "procurement@comstruct.eu",
    webhookUrl: "",
    autoReorder: false,
  });

  const handleSync = (id: string) => {
    if (syncing.has(id)) return;
    setSyncing((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setSuppliersList((prev) =>
        prev.map((s) => s.id === id ? { ...s, lastSync: "Just now", health: "good" as const } : s)
      );
      setSyncing((prev) => { const n = new Set(prev); n.delete(id); return n; });
      const supplier = suppliersList.find((s) => s.id === id);
      toast.success(`${supplier?.name} synced`, {
        description: "Catalog updated and prices refreshed successfully.",
      });
    }, 1600);
  };

  const openSettings = (s: LocalSupplier) => {
    setSettingsSupplier(s);
    setForm({
      syncInterval: s.health === "good" ? "1 hour" : "Daily",
      notificationEmail: "procurement@comstruct.eu",
      webhookUrl: s.channel === "API/PunchOut" ? "https://api.comstruct.eu/webhooks/catalog" : "",
      autoReorder: false,
    });
  };

  const saveSettings = () => {
    toast.success("Settings saved", {
      description: `${settingsSupplier?.name} — sync interval set to ${form.syncInterval}.`,
    });
    setSettingsSupplier(null);
  };

  return (
    <>
      <DashboardLayout title="Suppliers" subtitle="Integration channels & sync status">
        <div className="mb-4 flex justify-end">
          <button onClick={() => setShowAdd(true)} className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm inline-flex items-center gap-2">
            <Plus className="h-3.5 w-3.5" /> Add seller
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {suppliersList.map((s) => (
            <div key={s.id} className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">{s.channel}</div>
                  <h3 className="text-display text-lg font-semibold mt-1">{s.name}</h3>
                </div>
                <span className={["text-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded shrink-0", healthStyles[s.health]].join(" ")}>
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
                <div className="col-span-2">
                  <div className="text-mono text-[10px] uppercase text-muted-foreground tracking-wider">Source metadata</div>
                  <div className="text-xs text-muted-foreground">
                    Uploaded {s.uploadedAt} · Owner {s.owner} · Price refresh {s.lastPriceFetch}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => handleSync(s.id)}
                  disabled={syncing.has(s.id)}
                  className="text-sm flex-1 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
                >
                  <RefreshCw className={["h-3.5 w-3.5 transition-transform", syncing.has(s.id) ? "animate-spin" : ""].join(" ")} />
                  {syncing.has(s.id) ? "Syncing…" : "Sync now"}
                </button>
                <button
                  onClick={() => openSettings(s)}
                  className="text-sm px-3 py-2 rounded-md border border-border hover:bg-accent flex items-center gap-1.5"
                >
                  <Settings className="h-3.5 w-3.5" /> Settings
                </button>
              </div>
            </div>
          ))}
        </div>
      </DashboardLayout>

      {/* Settings modal */}
      {settingsSupplier && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20" onClick={() => setSettingsSupplier(null)} />
          <div className="relative bg-background border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/30">
              <div>
                <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Supplier settings</div>
                <div className="text-display text-base font-semibold mt-0.5">{settingsSupplier.name}</div>
              </div>
              <button
                onClick={() => setSettingsSupplier(null)}
                className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-5">
              {/* Channel info (read-only) */}
              <div className="rounded-md bg-secondary/50 px-4 py-3 text-sm">
                <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Integration channel</div>
                <div className="font-medium">{settingsSupplier.channel}</div>
              </div>

              {/* Sync interval */}
              <div>
                <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-2">
                  Sync interval
                </label>
                <div className="flex gap-2 flex-wrap">
                  {SYNC_INTERVALS.map((interval) => (
                    <button
                      key={interval}
                      onClick={() => setForm((f) => ({ ...f, syncInterval: interval }))}
                      className={[
                        "text-sm px-3 py-1.5 rounded-md border",
                        form.syncInterval === interval
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card border-border hover:bg-accent",
                      ].join(" ")}
                    >
                      {interval}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notification email */}
              <div>
                <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1.5">
                  Notification email
                </label>
                <input
                  type="email"
                  value={form.notificationEmail}
                  onChange={(e) => setForm((f) => ({ ...f, notificationEmail: e.target.value }))}
                  placeholder="email@comstruct.eu"
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Webhook URL */}
              <div>
                <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1.5">
                  Webhook URL <span className="normal-case">(optional)</span>
                </label>
                <input
                  type="url"
                  value={form.webhookUrl}
                  onChange={(e) => setForm((f) => ({ ...f, webhookUrl: e.target.value }))}
                  placeholder="https://…"
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="text-xs text-muted-foreground mt-1">
                  POST on every successful sync with updated catalog diff.
                </div>
              </div>

              {/* Auto-reorder toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Auto-reorder on stockout</div>
                  <div className="text-xs text-muted-foreground">Trigger purchase when item drops below min. stock</div>
                </div>
                <button
                  onClick={() => setForm((f) => ({ ...f, autoReorder: !f.autoReorder }))}
                  className={[
                    "relative h-6 w-11 rounded-full border transition-colors",
                    form.autoReorder ? "bg-primary border-primary" : "bg-muted border-border",
                  ].join(" ")}
                >
                  <span className={[
                    "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                    form.autoReorder ? "translate-x-5" : "translate-x-0",
                  ].join(" ")} />
                </button>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button
                onClick={() => setSettingsSupplier(null)}
                className="h-9 px-4 rounded-md border border-border text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={saveSettings}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 flex items-center gap-2"
              >
                <Save className="h-3.5 w-3.5" /> Save settings
              </button>
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
            <div className="px-6 py-5 space-y-3">
              <input className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm" placeholder="Seller name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <select className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm" value={newChannel} onChange={(e) => setNewChannel(e.target.value as Supplier["channel"])}>
                <option value="Excel upload">Excel upload</option>
                <option value="API/PunchOut">API/PunchOut</option>
                <option value="EDI">EDI</option>
                <option value="Email">Email</option>
              </select>
              <input className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm" placeholder="Owner email" value={newOwner} onChange={(e) => setNewOwner(e.target.value)} />
            </div>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
              <button className="h-9 px-4 rounded-md border border-border text-sm" onClick={() => setShowAdd(false)}>Cancel</button>
              <button
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm"
                onClick={() => {
                  if (!newName.trim()) return;
                  setSuppliersList((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      name: newName.trim(),
                      channel: newChannel,
                      items: 0,
                      spend: 0,
                      lastSync: "Not synced",
                      health: "warn",
                      uploadedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
                      lastPriceFetch: newChannel === "API/PunchOut" ? "Pending API sync" : "Manual upload",
                      owner: newOwner || "procurement@comstruct.eu",
                    },
                  ]);
                  toast.success(`Seller ${newName.trim()} added`);
                  setShowAdd(false);
                  setNewName("");
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
