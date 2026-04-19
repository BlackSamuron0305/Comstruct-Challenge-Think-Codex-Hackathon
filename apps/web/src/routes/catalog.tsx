import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/Layout";
import { QueryState } from "@/components/dashboard/QueryState";
import { api, formatCurrency, shortId, type ProductRecord, type SupplierRecord } from "@/lib/api";

export const Route = createFileRoute("/catalog")({
  head: () => ({
    meta: [
      { title: "Catalog · comstruct C-Materials" },
      { name: "description", content: "Normalized C-material catalog mapped from supplier Excel files, contracts and PunchOut feeds." },
    ],
  }),
  component: Catalog,
});

type PreviewPayload = {
  status: string;
  rows_in: number;
  preview_rows: Array<Record<string, unknown>>;
  source_columns?: Array<Record<string, unknown>>;
  canonical_fields?: string[];
  mapping?: {
    warnings?: string[];
    mappings?: Array<{
      source_column: string;
      target_field?: string | null;
      confidence?: number;
      reason?: string;
    }>;
  };
};

type ImportResult = {
  status: string;
  supplier_id?: string;
  rows_in?: number;
  c_materials?: number;
  excluded?: number;
  excluded_count?: number;
  excluded_samples?: Array<{
    name?: string;
    class?: string;
    reason?: string;
  }>;
};

type CatalogRow = {
  sku: string;
  name: string;
  group: string;
  unit: string;
  pack: string;
  supplier: string;
  price: number;
  currency: string;
  status: "mapped" | "needs-review";
  standard: boolean;
  tradeFit: string;
  variant: "Good" | "Better" | "Best";
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The upload could not be processed.";
}

function renderPreviewValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const tradeMatchers: Record<string, RegExp> = {
  drywall: /drywall|wall|board|fastener|screw/i,
  electrical: /electric|cable|tape|battery|light/i,
  sanitary: /sanitary|silikon|foam|pipe|seal/i,
  ppe: /ppe|glove|mask|safety/i,
  construction: /fastener|consumable|tool|site|ppe/i,
};

function toMappingOverridePayload(mappingOverrides: Record<string, string>) {
  return Object.entries(mappingOverrides)
    .filter(([, targetField]) => targetField !== "")
    .map(([sourceColumn, targetField]) => ({
      source_column: sourceColumn,
      target_field: targetField,
      confidence: 1,
      reason: "confirmed in UI",
    }));
}

function determineVariant(index: number, total: number): "Good" | "Better" | "Best" {
  if (total <= 1 || index === 0) return "Good";
  if (index === total - 1) return "Best";
  return "Better";
}

function Catalog() {
  const queryClient = useQueryClient();
  const [fileName, setFileName] = useState<string>("");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mappingOverrides, setMappingOverrides] = useState<Record<string, string>>({});
  const [selectedTrade, setSelectedTrade] = useState<string>("all");
  const [standardsOnly, setStandardsOnly] = useState<boolean>(false);
  const [lastImportResult, setLastImportResult] = useState<ImportResult | null>(null);

  function resetImportDraft() {
    setSelectedFile(null);
    setFileName("");
    setSelectedSupplierId("");
    setMappingOverrides({});
    setLastImportResult(null);
    previewMutation.reset();
  }

  const { data: products = [], isLoading: productsLoading, isError: productsError, refetch: refetchProducts } = useQuery({
    queryKey: ["products"],
    queryFn: () => api.get<ProductRecord[]>("/api/products", { params: { page_size: 200 } }),
  });

  const { data: suppliers = [], isLoading: suppliersLoading, isError: suppliersError, refetch: refetchSuppliers } = useQuery({
    queryKey: ["catalog-suppliers"],
    queryFn: () => api.get<SupplierRecord[]>("/api/suppliers"),
  });

  const previewMutation = useMutation({
    mutationFn: ({ file, overrides }: { file: File; overrides?: Record<string, string> }) => {
      const formData = new FormData();
      formData.append("file", file);
      const overridePayload = toMappingOverridePayload(overrides ?? {});
      if (overridePayload.length > 0) {
        formData.append("mapping_overrides", JSON.stringify(overridePayload));
      }
      return api.post<PreviewPayload>("/api/ingest/preview", formData);
    },
    onSuccess: (data) => {
      if (Object.keys(mappingOverrides).length === 0 && data.mapping?.mappings?.length) {
        setMappingOverrides(Object.fromEntries(data.mapping.mappings.map((entry) => [entry.source_column, entry.target_field ?? ""])));
      }
    },
    onError: (error) => toast.error(toErrorMessage(error)),
  });

  const importMutation = useMutation({
    mutationFn: () => {
      if (!selectedFile) throw new Error("Choose a file first");
      if (!selectedSupplierId) throw new Error("Choose a supplier first");
      const formData = new FormData();
      formData.append("supplier_id", selectedSupplierId);
      formData.append("file", selectedFile);
      formData.append("default_currency", "EUR");
      const overridePayload = toMappingOverridePayload(mappingOverrides);
      if (overridePayload.length > 0) {
        formData.append("mapping_overrides", JSON.stringify(overridePayload));
      }
      return api.post<ImportResult>("/api/ingest/supplier-file", formData);
    },
    onSuccess: (data) => {
      setLastImportResult(data);

      if (data.status === "ok") {
        toast.success(`Imported ${data.c_materials ?? 0} C-material records`);
        previewMutation.reset();
        setSelectedFile(null);
        setFileName("");
        setMappingOverrides({});
        queryClient.invalidateQueries({ queryKey: ["products"] });
        return;
      }

      if (data.status === "no_c_materials") {
        toast.error("The file was parsed, but no C-material rows were found.");
        return;
      }

      if (data.status === "no_valid_rows") {
        toast.error("The file was parsed, but the rows still need mapping review.");
        return;
      }

      if (data.status === "empty") {
        toast.error("The uploaded file did not contain any rows to import.");
        return;
      }

      toast.error("Import finished with issues that need manual review.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Import failed"),
  });

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setFileName(file.name);
    setMappingOverrides({});
    setLastImportResult(null);
    previewMutation.mutate({ file, overrides: {} });
  }

  const baseRows = useMemo(() => {
    return products.map((product) => ({
      sku: product.sku ?? shortId(product.id),
      name: product.name,
      group: product.category ?? "Uncategorised",
      unit: product.unit ?? "pc",
      pack: product.packaging_qty ? `Pack ${product.packaging_qty}` : "Single",
      supplier: suppliers.find((supplier) => supplier.id === product.supplier_id)?.name ?? shortId(product.supplier_id),
      price: product.unit_price ?? 0,
      currency: product.currency ?? "EUR",
      status: product.is_active === false || !product.category ? "needs-review" as const : "mapped" as const,
    }));
  }, [products, suppliers]);

  const rows = useMemo<CatalogRow[]>(() => {
    const byGroup = baseRows.reduce<Record<string, typeof baseRows>>((acc, row) => {
      acc[row.group] = [...(acc[row.group] ?? []), row].sort((left, right) => left.price - right.price);
      return acc;
    }, {});

    return baseRows.map((row) => {
      const bucket = byGroup[row.group] ?? [row];
      const index = bucket.findIndex((candidate) => candidate.sku === row.sku);
      const tradeKey = selectedTrade === "all" ? "construction" : selectedTrade;
      const matcher = tradeMatchers[tradeKey] ?? tradeMatchers.construction;
      const tradeFit = matcher.test(`${row.name} ${row.group}`) ? "Matched" : "General";
      return {
        ...row,
        standard: row.status === "mapped" && !/uncategorised/i.test(row.group),
        tradeFit,
        variant: determineVariant(index, bucket.length),
      };
    }).filter((row) => {
      const tradeKey = selectedTrade === "all" ? null : selectedTrade;
      const matcher = tradeKey ? (tradeMatchers[tradeKey] ?? tradeMatchers.construction) : null;
      const tradeOk = !matcher || matcher.test(`${row.name} ${row.group}`);
      const standardsOk = !standardsOnly || row.standard;
      return tradeOk && standardsOk;
    });
  }, [baseRows, selectedTrade, standardsOnly]);

  const mappedColumns = previewMutation.data?.mapping?.mappings ?? [];
  const previewIssues = mappedColumns.filter((entry) => !entry.target_field).length;
  const mappedCount = mappedColumns.length - previewIssues;
  const needsReview = previewMutation.data ? previewIssues : rows.filter((item) => item.status === "needs-review").length;
  const tradeOptions = ["all", "drywall", "electrical", "sanitary", "ppe"];
  const previewReady = Boolean(selectedFile && previewMutation.data && !previewMutation.isPending);
  const canImport = Boolean(selectedFile && selectedSupplierId && previewReady && previewIssues === 0 && !importMutation.isPending);
  const importBlockedReason = !selectedFile
    ? "Upload a supplier file to generate a preview first."
    : !selectedSupplierId
      ? "Choose the supplier that owns this catalog."
      : previewMutation.isPending
        ? "Wait for the preview and AI mapping review to finish."
        : previewIssues > 0
          ? "Resolve or explicitly ignore the remaining unmapped columns before importing."
          : null;

  if (productsLoading || suppliersLoading) {
    return (
      <DashboardLayout title="Catalog" subtitle="Normalized C-material assortment across suppliers">
        <QueryState
          kind="loading"
          title="Loading catalog workspace"
          description="Supplier products and mapping helpers are being prepared now."
        />
      </DashboardLayout>
    );
  }

  if (productsError || suppliersError) {
    return (
      <DashboardLayout title="Catalog" subtitle="Normalized C-material assortment across suppliers">
        <QueryState
          kind="error"
          title="Catalog data could not be loaded"
          description="The live catalog or supplier list is temporarily unavailable."
          onRetry={() => {
            void refetchProducts();
            void refetchSuppliers();
          }}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Catalog" subtitle="Normalized C-material assortment across suppliers">
      <div className="mb-4 rounded-lg border border-border bg-card p-4 text-sm">
        <div className="font-medium">Live catalog records</div>
        <p className="mt-1 text-muted-foreground">
          All products shown below are loaded from the backend catalog database and supplier imports.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <label className="rounded-lg border border-dashed border-border bg-card p-5 cursor-pointer hover:bg-accent/40 transition-colors">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 grid place-items-center rounded-md bg-primary text-primary-foreground"><Upload className="h-4 w-4" /></div>
            <div>
              <div className="font-medium text-sm">Upload Excel / CSV / PDF</div>
              <div className="text-xs text-muted-foreground">{fileName || "Map columns → SKU, price, unit"}</div>
            </div>
          </div>
          <input type="file" accept=".csv,.xlsx,.xls,.pdf" className="hidden" onChange={handleFileChange} />
        </label>

        <div className="rounded-lg border border-dashed border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 grid place-items-center rounded-md bg-hivis text-hivis-foreground"><Sparkles className="h-4 w-4" /></div>
            <div className="flex-1">
              <div className="font-medium text-sm">Live preview & import</div>
              <select
                value={selectedSupplierId}
                onChange={(event) => setSelectedSupplierId(event.target.value)}
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Choose supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            onClick={() => importMutation.mutate()}
            disabled={!canImport}
          >
            {importMutation.isPending ? "Importing…" : "Confirm import"}
          </button>
          <div className="mt-2 text-xs text-muted-foreground">
            {importBlockedReason ?? "Ready for import. The mapped file will be normalized into the live catalog."}
          </div>
          {(selectedFile || lastImportResult) && (
            <button
              className="mt-3 w-full rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
              onClick={resetImportDraft}
              type="button"
            >
              Reset upload
            </button>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 grid place-items-center rounded-md bg-warning/30 text-warning-foreground"><AlertCircle className="h-4 w-4" /></div>
            <div>
              <div className="font-medium text-sm tabular">{needsReview} items need review</div>
              <div className="text-xs text-muted-foreground">
                {previewMutation.data
                  ? `${previewMutation.data.rows_in} uploaded rows previewed · ${previewIssues} columns still need confirmation`
                  : "Waiting for a supplier file preview"}
              </div>
            </div>
          </div>
          {previewMutation.data?.mapping?.warnings?.length ? (
            <div className="mt-3 text-xs text-warning-foreground">
              {previewMutation.data.mapping.warnings.join(" · ")}
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="font-medium text-sm">Smart filters</div>
          <select value={selectedTrade} onChange={(event) => setSelectedTrade(event.target.value)} className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
            {tradeOptions.map((option) => <option key={option} value={option}>{option === "all" ? "All trades" : option}</option>)}
          </select>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={standardsOnly} onChange={(event) => setStandardsOnly(event.target.checked)} />
            Project standard only
          </label>
        </div>
      </div>

      {previewMutation.data && (
        <div className="mb-6 rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Column mapping review</div>
              <h3 className="text-display text-lg font-semibold">Confirm the AI mapping before import</h3>
            </div>
            {selectedFile && (
              <button className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent" onClick={() => previewMutation.mutate({ file: selectedFile, overrides: mappingOverrides })}>
                Refresh preview
              </button>
            )}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-border bg-secondary/40 p-3">
              <div className="text-xs text-muted-foreground">Rows previewed</div>
              <div className="mt-1 text-lg font-semibold">{previewMutation.data.rows_in}</div>
            </div>
            <div className="rounded-md border border-border bg-secondary/40 p-3">
              <div className="text-xs text-muted-foreground">Mapped columns</div>
              <div className="mt-1 text-lg font-semibold">{mappedCount}</div>
            </div>
            <div className="rounded-md border border-border bg-secondary/40 p-3">
              <div className="text-xs text-muted-foreground">Needs confirmation</div>
              <div className="mt-1 text-lg font-semibold">{previewIssues}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(previewMutation.data.mapping?.mappings ?? []).map((entry) => (
              <div key={entry.source_column} className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">Source column</div>
                <div className="font-medium">{entry.source_column}</div>
                <select
                  value={mappingOverrides[entry.source_column] ?? entry.target_field ?? ""}
                  onChange={(event) => setMappingOverrides((prev) => ({ ...prev, [entry.source_column]: event.target.value }))}
                  className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Ignore</option>
                  {(previewMutation.data.canonical_fields ?? []).map((field) => (
                    <option key={field} value={field}>{field}</option>
                  ))}
                </select>
                <div className="mt-1 text-xs text-muted-foreground">
                  Confidence {Math.round((entry.confidence ?? 0) * 100)}% · {entry.reason ?? "AI suggestion"}
                </div>
              </div>
            ))}
          </div>

          {previewMutation.data.preview_rows?.length ? (
            <div className="mt-5">
              <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Extracted row preview</div>
              <div className="mt-2 overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary text-left text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    <tr>
                      {Object.keys(previewMutation.data.preview_rows[0] ?? {}).map((key) => (
                        <th key={key} className="px-3 py-2 font-normal">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewMutation.data.preview_rows.map((row, index) => (
                      <tr key={`${index}-${JSON.stringify(row)}`} className="border-t border-border">
                        {Object.keys(previewMutation.data?.preview_rows?.[0] ?? {}).map((key) => (
                          <td key={key} className="px-3 py-2 text-muted-foreground">
                            {renderPreviewValue(row[key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {lastImportResult && (
        <div className="mb-6 rounded-lg border border-border bg-card p-5">
          <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Latest import result</div>
          <h3 className="mt-1 text-display text-lg font-semibold">
            {lastImportResult.status === "ok" ? "Supplier catalog imported" : "Import needs follow-up"}
          </h3>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-border bg-secondary/40 p-3">
              <div className="text-xs text-muted-foreground">Rows processed</div>
              <div className="mt-1 text-lg font-semibold">{lastImportResult.rows_in ?? 0}</div>
            </div>
            <div className="rounded-md border border-border bg-secondary/40 p-3">
              <div className="text-xs text-muted-foreground">C-materials kept</div>
              <div className="mt-1 text-lg font-semibold">{lastImportResult.c_materials ?? 0}</div>
            </div>
            <div className="rounded-md border border-border bg-secondary/40 p-3">
              <div className="text-xs text-muted-foreground">Excluded rows</div>
              <div className="mt-1 text-lg font-semibold">{lastImportResult.excluded ?? lastImportResult.excluded_count ?? 0}</div>
            </div>
          </div>

          {lastImportResult.excluded_samples?.length ? (
            <div className="mt-4 rounded-md border border-border p-3 text-sm">
              <div className="font-medium">Rows needing manual follow-up</div>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {lastImportResult.excluded_samples.map((sample, index) => (
                  <li key={`${sample.name ?? "sample"}-${index}`}>
                    {sample.name ?? "Unnamed item"} · {sample.class ?? "Unknown class"}
                    {sample.reason ? ` · ${sample.reason}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

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
              <th className="text-left font-normal px-5 py-3">Standard</th>
              <th className="text-left font-normal px-5 py-3">AI variant</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, index) => (
              <tr key={`${item.sku}-${item.supplier}-${index}`} className="border-t border-border hover:bg-secondary/60">
                <td className="px-5 py-3 text-mono text-xs">{item.sku}</td>
                <td className="px-5 py-3 font-medium">
                  {item.name}
                  <div className="text-xs text-muted-foreground">Trade fit: {item.tradeFit}</div>
                </td>
                <td className="px-5 py-3 text-muted-foreground">{item.group}</td>
                <td className="px-5 py-3 text-muted-foreground text-xs">{item.pack} · <span className="text-mono">{item.unit}</span></td>
                <td className="px-5 py-3">{item.supplier}</td>
                <td className="px-5 py-3 text-right tabular">{formatCurrency(item.price, item.currency)}</td>
                <td className="px-5 py-3">
                  <span className={[
                    "text-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded",
                    item.standard ? "bg-success/15 text-[oklch(0.42_0.13_155)]" : "bg-warning/30 text-warning-foreground",
                  ].join(" ")}>
                    {item.standard ? "Standard" : "Review"}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span className={[
                    "text-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded",
                    item.variant === "Good" ? "bg-secondary text-foreground" : item.variant === "Better" ? "bg-hivis/20 text-foreground" : "bg-primary/15 text-primary",
                  ].join(" ")}>
                    {item.variant}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">
                  No catalog records are stored in the database yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
