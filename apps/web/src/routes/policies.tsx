import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ShieldCheck, Save, Plus, Trash2, Sigma, Workflow } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/policies")({
  component: PoliciesPage,
});

const FOREMEN = ["M. Keller", "A. Brunner", "L. Studer", "R. Frei"] as const;

const ITEM_GROUPS = ["Fasteners", "Consumables", "PPE", "Tools", "Site supplies"] as const;

const STORAGE_KEY = "comstruct_policies_v1";

const DEFAULTS = {
  globalDaily: 250,
  foremanLimits: {
    "M. Keller": 400,
    "A. Brunner": 250,
    "L. Studer": 300,
    "R. Frei": 200,
  } as Record<string, number>,
  groupLimits: {
    Fasteners: 150,
    Consumables: 200,
    PPE: 120,
    Tools: 500,
    "Site supplies": 100,
  } as Record<string, number>,
  customRules: [] as { id: string; item: string; limit: number | "" }[],
  requestValidationEnabled: true,
  stddevMultiplier: 2.0,
  logisticRiskThreshold: 0.82,
  minHistoryPoints: 4,
};

const REQUEST_HISTORY_MOCK: Record<string, number[]> = {
  "Spanplattenschraube Torx 4.5×40": [120, 180, 220, 260, 300, 340, 390],
  "Arbeitshandschuhe Nitril Gr. 9": [12, 20, 24, 36, 48, 60, 72],
  "PU-Schaum 750ml Standard": [4, 8, 10, 12, 12, 16, 18],
};

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}

function PoliciesPage() {
  const saved = loadSaved();

  const [globalDaily, setGlobalDaily] = useState<number | "">(
    saved?.globalDaily ?? DEFAULTS.globalDaily,
  );
  const [foremanLimits, setForemanLimits] = useState<Record<string, number | "">>(
    saved?.foremanLimits ?? DEFAULTS.foremanLimits,
  );
  const [groupLimits, setGroupLimits] = useState<Record<string, number | "">>(
    saved?.groupLimits ?? DEFAULTS.groupLimits,
  );
  const [customRules, setCustomRules] = useState<
    { id: string; item: string; limit: number | "" }[]
  >(saved?.customRules ?? DEFAULTS.customRules);
  const [requestValidationEnabled, setRequestValidationEnabled] = useState<boolean>(
    saved?.requestValidationEnabled ?? DEFAULTS.requestValidationEnabled,
  );
  const [stddevMultiplier, setStddevMultiplier] = useState<number | "">(
    saved?.stddevMultiplier ?? DEFAULTS.stddevMultiplier,
  );
  const [logisticRiskThreshold, setLogisticRiskThreshold] = useState<number | "">(
    saved?.logisticRiskThreshold ?? DEFAULTS.logisticRiskThreshold,
  );
  const [minHistoryPoints, setMinHistoryPoints] = useState<number | "">(
    saved?.minHistoryPoints ?? DEFAULTS.minHistoryPoints,
  );
  const [sampleProduct, setSampleProduct] = useState<string>("Spanplattenschraube Torx 4.5×40");
  const [sampleProject, setSampleProject] = useState<string>("Letzigrund Tower B");
  const [sampleQuantity, setSampleQuantity] = useState<number | "">(320);
  const [sampleDate, setSampleDate] = useState<string>(new Date().toISOString().slice(0, 10));

  function handleSave() {
    const data = {
      globalDaily,
      foremanLimits,
      groupLimits,
      customRules,
      requestValidationEnabled,
      stddevMultiplier,
      logisticRiskThreshold,
      minHistoryPoints,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore storage errors
    }
    toast.success("Policies saved", {
      description: `Default ceiling CHF ${globalDaily || 0} · ${FOREMEN.length} foreman limits · ${ITEM_GROUPS.length} group caps saved.`,
    });
  }

  // Numeric input helper: returns "" to allow clearing, otherwise the number
  function parseNum(val: string): number | "" {
    if (val === "" || val === undefined) return "";
    const n = Number(val);
    return isNaN(n) ? "" : n;
  }

  const history = REQUEST_HISTORY_MOCK[sampleProduct] ?? [10, 20, 30, 40];
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const variance = history.reduce((acc, v) => acc + (v - mean) ** 2, 0) / history.length;
  const std = Math.sqrt(variance) || 1;
  const zScore = typeof sampleQuantity === "number" ? (sampleQuantity - mean) / std : 0;
  const upper = mean + Number(stddevMultiplier || DEFAULTS.stddevMultiplier) * std;
  const logistic = 1 / (1 + Math.exp(-(Math.abs(zScore) - 1.5)));
  const flagged =
    !!requestValidationEnabled &&
    ((typeof sampleQuantity === "number" && sampleQuantity > upper) ||
      logistic >= Number(logisticRiskThreshold || DEFAULTS.logisticRiskThreshold));

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
              Maximum CHF a foreman can order per day without procurement approval. Used as fallback
              when no foreman-specific limit is set.
            </p>
            <div className="mt-4 flex items-end gap-3">
              <div className="flex-1 max-w-xs">
                <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Default daily limit (CHF)
                </label>
                <Input
                  type="number"
                  min={0}
                  placeholder="e.g. 250"
                  value={globalDaily}
                  onChange={(e) => setGlobalDaily(parseNum(e.target.value))}
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
                      placeholder="e.g. 300"
                      value={foremanLimits[f] ?? ""}
                      onChange={(e) =>
                        setForemanLimits((prev) => ({ ...prev, [f]: parseNum(e.target.value) }))
                      }
                      className="w-32"
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <Sigma className="h-4 w-4 text-primary" />
              <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Request plausibility
              </div>
            </div>
            <h3 className="text-display text-lg font-semibold">
              Standardabweichung + logistic risk
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Evaluate incoming request quantity by product history before auto-approval.
            </p>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Enable check
                </label>
                <button
                  onClick={() => setRequestValidationEnabled((v) => !v)}
                  className={[
                    "mt-1 h-9 w-full rounded-md border text-sm",
                    requestValidationEnabled
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border",
                  ].join(" ")}
                >
                  {requestValidationEnabled ? "Enabled" : "Disabled"}
                </button>
              </div>
              <div>
                <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Stddev multiplier
                </label>
                <Input
                  type="number"
                  value={stddevMultiplier}
                  onChange={(e) => setStddevMultiplier(parseNum(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Logistic risk threshold
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={logisticRiskThreshold}
                  onChange={(e) => setLogisticRiskThreshold(parseNum(e.target.value))}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="mt-3 max-w-xs">
              <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Min history points
              </label>
              <Input
                type="number"
                value={minHistoryPoints}
                onChange={(e) => setMinHistoryPoints(parseNum(e.target.value))}
                className="mt-1"
              />
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
                    placeholder="e.g. 200"
                    value={groupLimits[g] ?? ""}
                    onChange={(e) =>
                      setGroupLimits((prev) => ({ ...prev, [g]: parseNum(e.target.value) }))
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
                  setCustomRules((r) => [...r, { id: crypto.randomUUID(), item: "", limit: "" }])
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
                        rules.map((x) => (x.id === r.id ? { ...x, item: e.target.value } : x)),
                      )
                    }
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={0}
                    placeholder="CHF"
                    value={r.limit}
                    onChange={(e) =>
                      setCustomRules((rules) =>
                        rules.map((x) =>
                          x.id === r.id ? { ...x, limit: parseNum(e.target.value) } : x,
                        ),
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
                <div className="text-xs text-muted-foreground">
                  No item-level overrides. Click + Rule to add one.
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <Workflow className="h-4 w-4 text-hivis" />
              <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Simulation
              </div>
            </div>
            <h3 className="text-display text-lg font-semibold">Incoming request test</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Product + quantity + date + project are scored against mock history.
            </p>
            <div className="mt-3 space-y-2">
              <select
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={sampleProduct}
                onChange={(e) => setSampleProduct(e.target.value)}
              >
                {Object.keys(REQUEST_HISTORY_MOCK).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Project"
                value={sampleProject}
                onChange={(e) => setSampleProject(e.target.value)}
              />
              <Input
                type="date"
                value={sampleDate}
                onChange={(e) => setSampleDate(e.target.value)}
              />
              <Input
                type="number"
                placeholder="Quantity"
                value={sampleQuantity}
                onChange={(e) => setSampleQuantity(parseNum(e.target.value))}
              />
            </div>
            <div
              className={[
                "mt-3 rounded-md border px-3 py-2 text-sm",
                flagged ? "border-warning/40 bg-warning/20" : "border-success/40 bg-success/10",
              ].join(" ")}
            >
              <div className="font-medium">
                {flagged ? "Flagged for review" : "Likely normal request"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                mean {mean.toFixed(1)} · std {std.toFixed(1)} · z {zScore.toFixed(2)} · logistic{" "}
                {logistic.toFixed(2)}
              </div>
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
