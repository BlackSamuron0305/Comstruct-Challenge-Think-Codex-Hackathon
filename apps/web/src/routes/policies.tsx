import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ShieldCheck, Save, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/policies")({
  component: PoliciesPage,
});

const FOREMEN = ["M. Keller", "A. Brunner", "L. Studer", "R. Frei"] as const;

const ITEM_GROUPS = [
  "Fasteners",
  "Consumables",
  "PPE",
  "Tools",
  "Site supplies",
] as const;

function PoliciesPage() {
  const [globalDaily, setGlobalDaily] = useState<number>(250);

  const [foremanLimits, setForemanLimits] = useState<Record<string, number>>({
    "M. Keller": 400,
    "A. Brunner": 250,
    "L. Studer": 300,
    "R. Frei": 200,
  });

  const [groupLimits, setGroupLimits] = useState<Record<string, number>>({
    Fasteners: 150,
    Consumables: 200,
    PPE: 120,
    Tools: 500,
    "Site supplies": 100,
  });

  const [customRules, setCustomRules] = useState<{ id: string; item: string; limit: number }[]>([
    { id: "r1", item: "Hilti Cordless Drill", limit: 0 },
  ]);

  function handleSave() {
    toast.success("Policies saved", {
      description: "New thresholds apply to incoming orders immediately.",
    });
  }

  return (
    <DashboardLayout
      title="Procurement policies"
      subtitle="Auto-approval thresholds and per-item limits for foreman ordering"
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* LEFT: Global + Foreman */}
        <div className="xl:col-span-2 space-y-6">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-4 w-4 text-hivis" />
              <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Global default
              </div>
            </div>
            <h3 className="text-display text-lg font-semibold">Daily auto-approval ceiling</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Maximum CHF a foreman can order per day without procurement approval.
              Used as fallback when no foreman-specific limit is set.
            </p>
            <div className="mt-4 flex items-end gap-3">
              <div className="flex-1 max-w-xs">
                <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Default daily limit (CHF)
                </label>
                <Input
                  type="number"
                  min={0}
                  value={globalDaily}
                  onChange={(e) => setGlobalDaily(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              Per foreman
            </div>
            <h3 className="text-display text-lg font-semibold">Daily limits without approval</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Orders below this CHF amount per day are auto-approved for the foreman.
            </p>

            <div className="mt-4 divide-y divide-border border border-border rounded-md">
              {FOREMEN.map((f) => (
                <div key={f} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium">{f}</div>
                    <div className="text-xs text-muted-foreground">Foreman</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      CHF / day
                    </span>
                    <Input
                      type="number"
                      min={0}
                      value={foremanLimits[f] ?? 0}
                      onChange={(e) =>
                        setForemanLimits((prev) => ({ ...prev, [f]: Number(e.target.value) }))
                      }
                      className="w-32"
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* RIGHT: Item-type limits */}
        <div className="space-y-6">
          <Card className="p-5">
            <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              Per item type
            </div>
            <h3 className="text-display text-lg font-semibold">Group spend limits</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Max CHF per single order, per item category.
            </p>

            <div className="mt-4 space-y-2">
              {ITEM_GROUPS.map((g) => (
                <div key={g} className="flex items-center justify-between gap-3">
                  <div className="text-sm">{g}</div>
                  <Input
                    type="number"
                    min={0}
                    value={groupLimits[g] ?? 0}
                    onChange={(e) =>
                      setGroupLimits((prev) => ({ ...prev, [g]: Number(e.target.value) }))
                    }
                    className="w-28"
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-1">
              <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Specific items
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setCustomRules((r) => [...r, { id: crypto.randomUUID(), item: "", limit: 0 }])
                }
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Rule
              </Button>
            </div>
            <h3 className="text-display text-lg font-semibold">Item-level overrides</h3>

            <div className="mt-3 space-y-2">
              {customRules.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <Input
                    placeholder="Item or SKU"
                    value={r.item}
                    onChange={(e) =>
                      setCustomRules((rules) =>
                        rules.map((x) => (x.id === r.id ? { ...x, item: e.target.value } : x))
                      )
                    }
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={r.limit}
                    onChange={(e) =>
                      setCustomRules((rules) =>
                        rules.map((x) =>
                          x.id === r.id ? { ...x, limit: Number(e.target.value) } : x
                        )
                      )
                    }
                    className="w-24"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setCustomRules((rules) => rules.filter((x) => x.id !== r.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {customRules.length === 0 && (
                <div className="text-xs text-muted-foreground">No item-level overrides.</div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} className="bg-hivis text-hivis-foreground hover:bg-hivis/90">
          <Save className="h-4 w-4 mr-2" /> Save policies
        </Button>
      </div>
    </DashboardLayout>
  );
}
