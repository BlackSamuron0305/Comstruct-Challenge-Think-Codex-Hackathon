import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrainCircuit, Save, Sigma, Tags, Truck, Workflow } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/policies")({
  component: PoliciesPage,
});

type SupplierBenchmark = {
  name: string;
  avgPrice: number;
  leadDays: number;
  fillRate: number;
  score: number;
};

type DemandFamily = {
  tag: string;
  label: string;
  cClass: boolean;
  aliases: string[];
  history: number[];
  suppliers: SupplierBenchmark[];
};

const STORAGE_KEY = "comstruct_statistics_v2";

const DEFAULTS = {
  stddevMultiplier: 2.0,
  logisticRiskThreshold: 0.82,
  recencyWeight: 0.65,
  minHistoryPoints: 6,
};

const PRODUCT_FAMILIES: DemandFamily[] = [
  {
    tag: "brushes",
    label: "Brushes & rollers",
    cClass: true,
    aliases: ["Painter brush 50mm", "Malerpinsel Set", "Flat brush 2in", "Paint roller mini"],
    history: [6, 8, 10, 12, 12, 14, 16, 18, 20, 24],
    suppliers: [
      { name: "HG Commerciale", avgPrice: 4.2, leadDays: 1.2, fillRate: 97, score: 91 },
      { name: "Würth Schweiz", avgPrice: 4.6, leadDays: 0.8, fillRate: 98, score: 92 },
      { name: "PUAG AG", avgPrice: 4.0, leadDays: 2.8, fillRate: 89, score: 78 },
    ],
  },
  {
    tag: "hammers",
    label: "Hammers & hand tools",
    cClass: true,
    aliases: ["Schlosserhammer 500g", "Rubber mallet", "Machinist hammer"],
    history: [1, 1, 2, 2, 2, 3, 3, 4],
    suppliers: [
      { name: "Debrunner Acifer", avgPrice: 16.9, leadDays: 1.6, fillRate: 96, score: 90 },
      { name: "Hilti Schweiz", avgPrice: 19.4, leadDays: 0.9, fillRate: 97, score: 88 },
      { name: "Würth Schweiz", avgPrice: 17.8, leadDays: 1.1, fillRate: 95, score: 89 },
    ],
  },
  {
    tag: "gloves",
    label: "Gloves & PPE",
    cClass: true,
    aliases: ["Arbeitshandschuhe Nitril Gr. 9", "Protective gloves", "Work glove pack"],
    history: [12, 20, 24, 36, 48, 60, 72, 84],
    suppliers: [
      { name: "HG Commerciale", avgPrice: 1.9, leadDays: 0.9, fillRate: 98, score: 95 },
      { name: "Würth Schweiz", avgPrice: 2.1, leadDays: 0.8, fillRate: 97, score: 93 },
      { name: "PUAG AG", avgPrice: 1.8, leadDays: 2.1, fillRate: 90, score: 80 },
    ],
  },
  {
    tag: "screws",
    label: "Screws & anchors",
    cClass: true,
    aliases: ["Spanplattenschraube Torx 4.5×40", "Wood screws box", "Nylon anchor UX 8×50"],
    history: [120, 180, 220, 260, 300, 340, 390, 430, 500],
    suppliers: [
      { name: "Würth Schweiz", avgPrice: 0.06, leadDays: 0.7, fillRate: 99, score: 97 },
      { name: "Hilti Schweiz", avgPrice: 0.08, leadDays: 1.1, fillRate: 97, score: 91 },
      { name: "Debrunner Acifer", avgPrice: 0.07, leadDays: 1.6, fillRate: 95, score: 88 },
    ],
  },
  {
    tag: "sealants",
    label: "Foam & sealants",
    cClass: true,
    aliases: ["PU-Schaum 750ml Standard", "Silikon sanitär weiss 310ml", "Acrylic sealant"],
    history: [4, 6, 8, 10, 12, 12, 16, 18, 20],
    suppliers: [
      { name: "PUAG AG", avgPrice: 4.7, leadDays: 1.7, fillRate: 92, score: 84 },
      { name: "HG Commerciale", avgPrice: 5.0, leadDays: 1.1, fillRate: 95, score: 89 },
      { name: "Würth Schweiz", avgPrice: 5.4, leadDays: 0.9, fillRate: 97, score: 90 },
    ],
  },
  {
    tag: "tapes",
    label: "Tapes & wraps",
    cClass: true,
    aliases: ["Gewebeband silber 19mm × 50m", "Electrical tape", "Masking tape"],
    history: [2, 3, 4, 5, 6, 8, 10, 12],
    suppliers: [
      { name: "Hilti Schweiz", avgPrice: 5.4, leadDays: 1.0, fillRate: 96, score: 90 },
      { name: "Würth Schweiz", avgPrice: 5.7, leadDays: 0.8, fillRate: 98, score: 92 },
      { name: "HG Commerciale", avgPrice: 5.1, leadDays: 1.4, fillRate: 94, score: 87 },
    ],
  },
  {
    tag: "batteries",
    label: "Batteries & site supplies",
    cClass: true,
    aliases: ["Batterie Alkaline AA", "Battery pack 9V", "AAA batteries"],
    history: [4, 8, 8, 12, 12, 16, 20, 24],
    suppliers: [
      { name: "Würth Schweiz", avgPrice: 0.65, leadDays: 0.8, fillRate: 97, score: 93 },
      { name: "HG Commerciale", avgPrice: 0.61, leadDays: 1.3, fillRate: 95, score: 90 },
      { name: "PUAG AG", avgPrice: 0.58, leadDays: 2.6, fillRate: 88, score: 77 },
    ],
  },
];

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}

function parseNum(val: string): number | "" {
  if (val === "" || val === undefined) return "";
  const n = Number(val);
  return Number.isNaN(n) ? "" : n;
}

function normalize(text: string) {
  return text.toLowerCase();
}

function matchFamily(text: string) {
  const q = normalize(text);
  if (/(brush|pinsel|roller|borste)/.test(q)) return "brushes";
  if (/(hammer|mallet|faustel)/.test(q)) return "hammers";
  if (/(glove|handschuh|nitril)/.test(q)) return "gloves";
  if (/(screw|schraub|anchor|dübel|dubel|fastener)/.test(q)) return "screws";
  if (/(foam|schaum|silikon|sealant|adhesive)/.test(q)) return "sealants";
  if (/(tape|band)/.test(q)) return "tapes";
  if (/(battery|batterie|akku)/.test(q)) return "batteries";
  return "brushes";
}

function computeStats(history: number[], recencyWeight: number, stddevMultiplier: number) {
  const mean = history.reduce((sum, value) => sum + value, 0) / history.length;
  const recent = history.slice(-Math.min(4, history.length));
  const recentMean = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const expected = recentMean * recencyWeight + mean * (1 - recencyWeight);
  const variance = history.reduce((sum, value) => sum + (value - mean) ** 2, 0) / history.length;
  const std = Math.sqrt(variance) || 1;
  const upper = expected + stddevMultiplier * std;
  return { mean, expected, std, upper };
}

function PoliciesPage() {
  const saved = loadSaved();
  const [stddevMultiplier, setStddevMultiplier] = useState<number | "">(
    saved?.stddevMultiplier ?? DEFAULTS.stddevMultiplier,
  );
  const [logisticRiskThreshold, setLogisticRiskThreshold] = useState<number | "">(
    saved?.logisticRiskThreshold ?? DEFAULTS.logisticRiskThreshold,
  );
  const [recencyWeight, setRecencyWeight] = useState<number | "">(
    saved?.recencyWeight ?? DEFAULTS.recencyWeight,
  );
  const [minHistoryPoints, setMinHistoryPoints] = useState<number | "">(
    saved?.minHistoryPoints ?? DEFAULTS.minHistoryPoints,
  );
  const [newProductName, setNewProductName] = useState<string>("Profi Malerpinsel 70mm");
  const [sampleTag, setSampleTag] = useState<string>("brushes");
  const [sampleQuantity, setSampleQuantity] = useState<number | "">(18);

  const selectedFamily = useMemo(
    () => PRODUCT_FAMILIES.find((item) => item.tag === sampleTag) ?? PRODUCT_FAMILIES[0],
    [sampleTag],
  );

  const recency = Number(recencyWeight || DEFAULTS.recencyWeight);
  const sigma = Number(stddevMultiplier || DEFAULTS.stddevMultiplier);
  const riskThreshold = Number(logisticRiskThreshold || DEFAULTS.logisticRiskThreshold);
  const stats = computeStats(selectedFamily.history, recency, sigma);
  const zScore = typeof sampleQuantity === "number" ? (sampleQuantity - stats.expected) / stats.std : 0;
  const logistic = 1 / (1 + Math.exp(-(Math.abs(zScore) - 1.5)));
  const flagged = typeof sampleQuantity === "number"
    ? sampleQuantity > stats.upper || logistic >= riskThreshold
    : false;

  const matchedTag = matchFamily(newProductName);
  const matchedFamily = PRODUCT_FAMILIES.find((item) => item.tag === matchedTag) ?? PRODUCT_FAMILIES[0];
  const bestSupplier = [...selectedFamily.suppliers].sort((a, b) => b.score - a.score)[0];

  function handleSave() {
    const data = {
      stddevMultiplier,
      logisticRiskThreshold,
      recencyWeight,
      minHistoryPoints,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore storage errors
    }
    toast.success("Statistical model saved", {
      description: `σ multiplier ${sigma} · risk threshold ${riskThreshold} · min history ${minHistoryPoints || DEFAULTS.minHistoryPoints}`,
    });
  }

  return (
    <DashboardLayout
      title="Demand intelligence"
      subtitle="Statistical auto-approval using AI product tags, expected order size, and supplier learning"
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <BrainCircuit className="h-4 w-4 text-hivis" />
              <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Statistics instead of fixed policies
              </div>
            </div>
            <h3 className="text-display text-lg font-semibold">How approval works now</h3>
            <p className="text-sm text-muted-foreground mt-1">
              New C-class products are compared against existing items, mapped to the same AI tag,
              and scored using Erwartungswert and Standardabweichung from historical demand.
            </p>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  σ multiplier
                </label>
                <Input value={stddevMultiplier} onChange={(e) => setStddevMultiplier(parseNum(e.target.value))} className="mt-1" type="number" step="0.1" />
              </div>
              <div>
                <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Risk threshold
                </label>
                <Input value={logisticRiskThreshold} onChange={(e) => setLogisticRiskThreshold(parseNum(e.target.value))} className="mt-1" type="number" step="0.01" />
              </div>
              <div>
                <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Recency weight
                </label>
                <Input value={recencyWeight} onChange={(e) => setRecencyWeight(parseNum(e.target.value))} className="mt-1" type="number" step="0.05" />
              </div>
              <div>
                <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Min history
                </label>
                <Input value={minHistoryPoints} onChange={(e) => setMinHistoryPoints(parseNum(e.target.value))} className="mt-1" type="number" />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <Sigma className="h-4 w-4 text-primary" />
              <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Product-family baselines
              </div>
            </div>
            <h3 className="text-display text-lg font-semibold">Mock demand history by AI tag</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-3">Tag</th>
                    <th className="py-2 pr-3">Aliases</th>
                    <th className="py-2 pr-3">Erwartungswert</th>
                    <th className="py-2 pr-3">Standardabw.</th>
                    <th className="py-2 pr-3">Best supplier</th>
                  </tr>
                </thead>
                <tbody>
                  {PRODUCT_FAMILIES.map((family) => {
                    const familyStats = computeStats(family.history, recency, sigma);
                    const supplier = [...family.suppliers].sort((a, b) => b.score - a.score)[0];
                    return (
                      <tr key={family.tag} className="border-b border-border/60">
                        <td className="py-3 pr-3">
                          <div className="font-medium">{family.label}</div>
                          <div className="text-xs text-muted-foreground">{family.tag}</div>
                        </td>
                        <td className="py-3 pr-3 text-xs text-muted-foreground">{family.aliases.slice(0, 2).join(" · ")}</td>
                        <td className="py-3 pr-3">{familyStats.expected.toFixed(1)}</td>
                        <td className="py-3 pr-3">{familyStats.std.toFixed(1)}</td>
                        <td className="py-3 pr-3">{supplier.name}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <Tags className="h-4 w-4 text-primary" />
              <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                AI product matching
              </div>
            </div>
            <h3 className="text-display text-lg font-semibold">Tag new products without relying on article numbers</h3>
            <p className="text-sm text-muted-foreground mt-1">
              If a new product looks similar to an existing family, it inherits the same tag and joins the same statistical history.
            </p>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">New product</label>
                <Input value={newProductName} onChange={(e) => setNewProductName(e.target.value)} className="mt-1" placeholder="Example: Profi Malerpinsel 70mm" />
              </div>
              <div className="rounded-md border border-success/40 bg-success/10 px-3 py-2">
                <div className="text-xs text-muted-foreground">Matched AI tag</div>
                <div className="font-medium mt-1">{matchedFamily.label}</div>
                <div className="text-xs text-muted-foreground mt-1">Similar items: {matchedFamily.aliases.join(" · ")}</div>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <Workflow className="h-4 w-4 text-hivis" />
              <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Acceptance simulation
              </div>
            </div>
            <h3 className="text-display text-lg font-semibold">Expected order size calculator</h3>
            <div className="mt-3 space-y-2">
              <select
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={sampleTag}
                onChange={(e) => setSampleTag(e.target.value)}
              >
                {PRODUCT_FAMILIES.map((family) => (
                  <option key={family.tag} value={family.tag}>{family.label}</option>
                ))}
              </select>
              <Input type="number" value={sampleQuantity} onChange={(e) => setSampleQuantity(parseNum(e.target.value))} placeholder="Quantity" />
            </div>
            <div className={["mt-3 rounded-md border px-3 py-3 text-sm", flagged ? "border-warning/40 bg-warning/20" : "border-success/40 bg-success/10"].join(" ")}>
              <div className="font-medium">{flagged ? "Route to approval review" : "Auto-accept statistically normal order"}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Erwartungswert {stats.expected.toFixed(1)} · Standardabweichung {stats.std.toFixed(1)} · upper band {stats.upper.toFixed(1)} · z {zScore.toFixed(2)} · risk {logistic.toFixed(2)}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <Truck className="h-4 w-4 text-primary" />
              <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Supplier benchmarking
              </div>
            </div>
            <h3 className="text-display text-lg font-semibold">Preferred suppliers for {selectedFamily.label}</h3>
            <div className="mt-3 space-y-2">
              {selectedFamily.suppliers.map((supplier) => (
                <div key={supplier.name} className="rounded-md border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{supplier.name}</div>
                    <div className="text-xs text-muted-foreground">score {supplier.score}</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    avg CHF {supplier.avgPrice.toFixed(2)} · lead {supplier.leadDays.toFixed(1)}d · fill rate {supplier.fillRate}%
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              Current best supplier: <span className="font-medium text-foreground">{bestSupplier.name}</span>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} className="bg-hivis text-hivis-foreground hover:bg-hivis/90">
              <Save className="h-4 w-4 mr-2" /> Save model settings
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
