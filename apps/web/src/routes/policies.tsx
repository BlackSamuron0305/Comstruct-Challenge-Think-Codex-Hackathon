import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BrainCircuit, Sigma, Tags, Truck, Workflow } from "lucide-react";

import { DashboardLayout } from "@/components/dashboard/Layout";
import { QueryState } from "@/components/dashboard/QueryState";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { api, formatCurrency, type ApprovalRule, type OrderSummary, type ProductRecord, type SupplierRecord } from "@/lib/api";

export const Route = createFileRoute("/policies")({
  head: () => ({
    meta: [
      { title: "Demand intelligence · comstruct C-Materials" },
      { name: "description", content: "Live demand intelligence using the current catalog, suppliers, and order history." },
    ],
  }),
  component: PoliciesPage,
});

type SupplierBenchmark = {
  name: string;
  avgPrice: number;
  itemCount: number;
};

type DemandFamily = {
  tag: string;
  label: string;
  aliases: string[];
  history: number[];
  suppliers: SupplierBenchmark[];
};

const DEFAULTS = {
  stddevMultiplier: 2.0,
  recencyWeight: 0.65,
};

function parseNum(val: string): number | "" {
  if (val === "" || val === undefined) return "";
  const n = Number(val);
  return Number.isNaN(n) ? "" : n;
}

function normalizeKey(value?: string | null): string {
  return value?.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() || "uncategorised";
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function chooseBestFamily(text: string, families: DemandFamily[]): DemandFamily | null {
  const query = text.toLowerCase().trim();
  if (!query) return families[0] ?? null;

  const ranked = families
    .map((family) => {
      const haystack = [family.label, family.tag, ...family.aliases].join(" ").toLowerCase();
      const tokenScore = query.split(/\s+/).reduce((sum, token) => sum + (token && haystack.includes(token) ? 1 : 0), 0);
      const directBonus = haystack.includes(query) ? 4 : 0;
      return { family, score: tokenScore + directBonus };
    })
    .sort((left, right) => right.score - left.score || right.family.aliases.length - left.family.aliases.length);

  return ranked[0]?.family ?? families[0] ?? null;
}

function PoliciesPage() {
  const [stddevMultiplier, setStddevMultiplier] = useState<number | "">(DEFAULTS.stddevMultiplier);
  const [recencyWeight, setRecencyWeight] = useState<number | "">(DEFAULTS.recencyWeight);
  const [newProductName, setNewProductName] = useState<string>("");
  const [sampleTag, setSampleTag] = useState<string>("");
  const [sampleQuantity, setSampleQuantity] = useState<number | "">(5);

  const { data: products = [], isLoading: productsLoading, isError: productsError, refetch: refetchProducts } = useQuery({
    queryKey: ["policies", "products"],
    queryFn: () => api.get<ProductRecord[]>("/api/products", { params: { page_size: 500 } }),
  });
  const { data: orders = [], isLoading: ordersLoading, isError: ordersError, refetch: refetchOrders } = useQuery({
    queryKey: ["policies", "orders"],
    queryFn: () => api.get<OrderSummary[]>("/api/orders", { params: { limit: 200 } }),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["policies", "suppliers"],
    queryFn: () => api.get<SupplierRecord[]>("/api/suppliers"),
  });
  const { data: approvalRule } = useQuery({
    queryKey: ["policies", "rule"],
    queryFn: () => api.get<ApprovalRule | null>("/api/approvals/rule"),
  });

  const families = useMemo<DemandFamily[]>(() => {
    type SupplierAggregate = { totalPrice: number; samples: number; itemCount: number };
    type Bucket = { label: string; aliases: Set<string>; history: number[]; suppliers: Map<string, SupplierAggregate> };

    const supplierNameById = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
    const buckets = new Map<string, Bucket>();

    function getBucket(key: string, label?: string): Bucket {
      const existing = buckets.get(key);
      if (existing) {
        if (label && (!existing.label || existing.label === titleCase(key))) {
          existing.label = label;
        }
        return existing;
      }
      const created: Bucket = { label: label || titleCase(key), aliases: new Set<string>(), history: [], suppliers: new Map<string, SupplierAggregate>() };
      buckets.set(key, created);
      return created;
    }

    function addSupplierMetric(bucket: Bucket, name: string, unitPrice: number, itemCount: number) {
      const current = bucket.suppliers.get(name) ?? { totalPrice: 0, samples: 0, itemCount: 0 };
      current.totalPrice += unitPrice;
      current.samples += 1;
      current.itemCount += itemCount;
      bucket.suppliers.set(name, current);
    }

    products.forEach((product) => {
      const key = normalizeKey(product.taxonomy_code ?? product.category ?? product.name);
      const bucket = getBucket(key, product.taxonomy_label ?? product.category ?? product.name);
      bucket.aliases.add(product.name);
      const supplierName = product.supplier_name ?? supplierNameById.get(product.supplier_id ?? "") ?? "Unknown supplier";
      const unitPrice = Number(product.unit_price ?? 0);
      if (supplierName && Number.isFinite(unitPrice) && unitPrice > 0) {
        addSupplierMetric(bucket, supplierName, unitPrice, 1);
      }
    });

    orders.forEach((order) => {
      order.items?.forEach((item) => {
        const key = normalizeKey(
          item.product_snapshot?.taxonomy_code
            ?? item.product_snapshot?.taxonomy_label
            ?? item.product_snapshot?.category
            ?? item.product_snapshot?.name
            ?? "Uncategorised",
        );
        const bucket = getBucket(
          key,
          item.product_snapshot?.taxonomy_label
            ?? item.product_snapshot?.category
            ?? item.product_snapshot?.name
            ?? "Uncategorised",
        );
        if (item.product_snapshot?.name) {
          bucket.aliases.add(item.product_snapshot.name);
        }

        const quantity = Number(item.quantity ?? 0);
        if (Number.isFinite(quantity) && quantity > 0) {
          bucket.history.push(quantity);
        }

        const supplierName = item.product_snapshot?.supplier_name
          ?? order.supplier_name
          ?? supplierNameById.get(order.supplier_id ?? "")
          ?? "Unknown supplier";
        const unitPrice = Number(item.unit_price ?? 0);
        if (supplierName && Number.isFinite(unitPrice) && unitPrice > 0) {
          addSupplierMetric(bucket, supplierName, unitPrice, 0);
        }
      });
    });

    return [...buckets.entries()]
      .map(([key, bucket]) => ({
        tag: key,
        label: bucket.label || titleCase(key),
        aliases: [...bucket.aliases].slice(0, 4),
        history: bucket.history.length ? bucket.history : [1],
        suppliers: [...bucket.suppliers.entries()]
          .map(([name, stats]) => ({
            name,
            avgPrice: stats.samples ? stats.totalPrice / stats.samples : 0,
            itemCount: stats.itemCount,
          }))
          .sort((left, right) => left.avgPrice - right.avgPrice || right.itemCount - left.itemCount),
      }))
      .sort((left, right) => right.history.length - left.history.length || left.label.localeCompare(right.label));
  }, [orders, products, suppliers]);

  const selectedFamily = families.find((family) => family.tag === sampleTag) ?? families[0] ?? null;
  const matchedFamily = chooseBestFamily(newProductName, families) ?? selectedFamily;

  const recency = Number(recencyWeight || DEFAULTS.recencyWeight);
  const sigma = Number(stddevMultiplier || DEFAULTS.stddevMultiplier);
  const stats = computeStats(selectedFamily?.history ?? [1], recency, sigma);
  const quantity = typeof sampleQuantity === "number" ? sampleQuantity : 0;
  const zScore = (quantity - stats.expected) / stats.std;
  const estimatedUnitPrice = selectedFamily?.suppliers[0]?.avgPrice ?? 0;
  const thresholdAmount = Number(approvalRule?.threshold_amount ?? 500);
  const estimatedSpend = quantity * estimatedUnitPrice;
  const flagged = quantity > stats.upper || estimatedSpend > thresholdAmount;
  const orderLines = orders.reduce((sum, order) => sum + (order.items?.length ?? 0), 0);

  if (productsLoading || ordersLoading) {
    return (
      <DashboardLayout title="Demand intelligence" subtitle="Live policy insight from the current database">
        <QueryState kind="loading" title="Loading live demand intelligence" description="Catalog, suppliers, and order history are being analyzed now." />
      </DashboardLayout>
    );
  }

  if (productsError || ordersError) {
    return (
      <DashboardLayout title="Demand intelligence" subtitle="Live policy insight from the current database">
        <QueryState kind="error" title="Demand intelligence could not be loaded" description="The live policy inputs are temporarily unavailable." onRetry={() => { void refetchProducts(); void refetchOrders(); }} />
      </DashboardLayout>
    );
  }

  if (!selectedFamily) {
    return (
      <DashboardLayout title="Demand intelligence" subtitle="Live policy insight from the current database">
        <div className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">
          No live catalog or order history is available yet. Import a supplier file to start building demand intelligence.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Demand intelligence" subtitle="Statistical approval guidance from live catalog and order history">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <BrainCircuit className="h-4 w-4 text-hivis" />
              <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Live policy model
              </div>
            </div>
            <h3 className="text-display text-lg font-semibold">How approval works now</h3>
            <p className="text-sm text-muted-foreground mt-1">
              This page now derives its baselines from live catalog subcategories, supplier prices, and historical order line quantities stored in the database.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              If you are not sure how to configure these numbers, it is perfectly fine to keep them as they are.
            </p>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">σ multiplier</label>
                <Input value={stddevMultiplier} onChange={(e) => setStddevMultiplier(parseNum(e.target.value))} className="mt-1" type="number" step="0.1" />
              </div>
              <div>
                <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Recency weight</label>
                <Input value={recencyWeight} onChange={(e) => setRecencyWeight(parseNum(e.target.value))} className="mt-1" type="number" step="0.05" />
              </div>
              <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
                <div className="text-xs text-muted-foreground">Observed groups</div>
                <div className="font-medium mt-1">{families.length}</div>
              </div>
              <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
                <div className="text-xs text-muted-foreground">Order lines analysed</div>
                <div className="font-medium mt-1">{orderLines}</div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <Sigma className="h-4 w-4 text-primary" />
              <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Live baselines by category
              </div>
            </div>
            <h3 className="text-display text-lg font-semibold">Current demand history from the database</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-3">Group</th>
                    <th className="py-2 pr-3">Example items</th>
                    <th className="py-2 pr-3">Expected qty</th>
                    <th className="py-2 pr-3">Std. dev.</th>
                    <th className="py-2 pr-3">Best live supplier</th>
                  </tr>
                </thead>
                <tbody>
                  {families.map((family) => {
                    const familyStats = computeStats(family.history, recency, sigma);
                    return (
                      <tr key={family.tag} className="border-b border-border/60">
                        <td className="py-3 pr-3">
                          <div className="font-medium">{family.label}</div>
                          <div className="text-xs text-muted-foreground">{family.history.length} observations</div>
                        </td>
                        <td className="py-3 pr-3 text-xs text-muted-foreground">{family.aliases.slice(0, 2).join(" · ") || "No named items yet"}</td>
                        <td className="py-3 pr-3">{familyStats.expected.toFixed(1)}</td>
                        <td className="py-3 pr-3">{familyStats.std.toFixed(1)}</td>
                        <td className="py-3 pr-3">{family.suppliers[0]?.name ?? "No live supplier data"}</td>
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
                Live item matching
              </div>
            </div>
            <h3 className="text-display text-lg font-semibold">Map new items to real catalog groups</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Enter a material name to see which live product group it most closely matches in the current database.
            </p>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">New product</label>
                <Input value={newProductName} onChange={(e) => setNewProductName(e.target.value)} className="mt-1" placeholder="Example: Drywall screw 4.5 × 40" />
              </div>
              <div className="rounded-md border border-success/40 bg-success/10 px-3 py-2">
                <div className="text-xs text-muted-foreground">Closest live group</div>
                <div className="font-medium mt-1">{matchedFamily?.label ?? "Waiting for input"}</div>
                <div className="text-xs text-muted-foreground mt-1">Examples: {matchedFamily?.aliases.join(" · ") || "No examples available yet"}</div>
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
              <select className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm" value={selectedFamily.tag} onChange={(e) => setSampleTag(e.target.value)}>
                {families.map((family) => (
                  <option key={family.tag} value={family.tag}>{family.label}</option>
                ))}
              </select>
              <Input type="number" value={sampleQuantity} onChange={(e) => setSampleQuantity(parseNum(e.target.value))} placeholder="Quantity" />
            </div>
            <div className={["mt-3 rounded-md border px-3 py-3 text-sm", flagged ? "border-warning/40 bg-warning/20" : "border-success/40 bg-success/10"].join(" ")}>
              <div className="font-medium">{flagged ? "Route to approval review" : "Order stays within the normal live range"}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Expected {stats.expected.toFixed(1)} · std. dev. {stats.std.toFixed(1)} · upper band {stats.upper.toFixed(1)} · estimated spend {formatCurrency(estimatedSpend, "EUR")}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Approval threshold: {formatCurrency(thresholdAmount, "EUR")} · z-score {zScore.toFixed(2)}
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
            <h3 className="text-display text-lg font-semibold">Live supplier options for {selectedFamily.label}</h3>
            <div className="mt-3 space-y-2">
              {selectedFamily.suppliers.length > 0 ? selectedFamily.suppliers.map((supplier) => (
                <div key={supplier.name} className="rounded-md border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{supplier.name}</div>
                    <div className="text-xs text-muted-foreground">{supplier.itemCount} items</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Average live unit price {formatCurrency(supplier.avgPrice, "EUR")}
                  </div>
                </div>
              )) : (
                <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
                  No supplier pricing is available yet for this group.
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
