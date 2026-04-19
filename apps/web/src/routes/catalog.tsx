import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/Layout";
import { QueryState } from "@/components/dashboard/QueryState";
import { api, formatCurrency, shortId, type ProductRecord, type SupplierRecord } from "@/lib/api";
import { createLocalSupplierDraft, loadLocalSuppliers, saveLocalSuppliers, type LocalSupplierDraft, type SupplierChannel } from "@/lib/local-suppliers";

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
  id: string;
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

function formatCatalogPrice(price: number, currency: string): string {
  if (!Number.isFinite(price) || price <= 0) return "Awaiting price";
  return formatCurrency(price, currency);
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
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState<string>("");
  const [mappingOverrides, setMappingOverrides] = useState<Record<string, string>>({});
  const [approvedMappings, setApprovedMappings] = useState<Record<string, boolean>>({});
  const [selectedTrade, setSelectedTrade] = useState<string>("all");
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [standardsOnly, setStandardsOnly] = useState<boolean>(false);
  const [lastImportResult, setLastImportResult] = useState<ImportResult | null>(null);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [localSuppliers, setLocalSuppliers] = useState<LocalSupplierDraft[]>(() => loadLocalSuppliers());
  const [draftSupplierName, setDraftSupplierName] = useState("");
  const [draftSupplierContact, setDraftSupplierContact] = useState("");
  const [draftSupplierEmail, setDraftSupplierEmail] = useState("");
  const [draftSupplierPhone, setDraftSupplierPhone] = useState("");
  const [draftSupplierChannel, setDraftSupplierChannel] = useState<SupplierChannel>("Excel/PDF upload");

  useEffect(() => {
    if (!selectedFile) {
      setDocumentPreviewUrl("");
      return;
    }

    const nextUrl = URL.createObjectURL(selectedFile);
    setDocumentPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [selectedFile]);

  function resetImportDraft() {
    setSelectedFile(null);
    setFileName("");
    setSelectedSupplierId("");
    setMappingOverrides({});
    setApprovedMappings({});
    setLastImportResult(null);
    previewMutation.reset();
  }

  function resetSupplierDraft() {
    setDraftSupplierName("");
    setDraftSupplierContact("");
    setDraftSupplierEmail("");
    setDraftSupplierPhone("");
    setDraftSupplierChannel("Excel/PDF upload");
  }

  function handleSupplierSelect(nextValue: string) {
    if (nextValue === "__new__") {
      setShowAddSupplier(true);
      return;
    }
    setSelectedSupplierId(nextValue);
  }

  function handleCreateSupplier() {
    if (!draftSupplierName.trim()) {
      toast.error("Please enter a supplier name.");
      return;
    }

    createSupplierMutation.mutate({
      name: draftSupplierName.trim(),
      contact_name: draftSupplierContact.trim() || undefined,
      email: draftSupplierEmail.trim() || undefined,
      phone: draftSupplierPhone.trim() || undefined,
      channel: draftSupplierChannel,
    });
  }

  const { data: products = [], isLoading: productsLoading, isError: productsError, refetch: refetchProducts } = useQuery({
    queryKey: ["products"],
    queryFn: () => api.get<ProductRecord[]>("/api/products", { params: { page_size: 200 } }),
  });

  const { data: suppliers = [], isLoading: suppliersLoading, isError: suppliersError, refetch: refetchSuppliers } = useQuery({
    queryKey: ["catalog-suppliers"],
    queryFn: () => api.get<SupplierRecord[]>("/api/suppliers"),
  });

  const createSupplierMutation = useMutation({
    mutationFn: async (payload: { name: string; contact_name?: string; email?: string; phone?: string; channel: SupplierChannel }) => {
      const { channel: _channel, ...body } = payload;
      return api.post<SupplierRecord>("/api/suppliers", body);
    },
    onSuccess: (created) => {
      const dedupedLocal = localSuppliers.filter((supplier) => supplier.name.trim().toLowerCase() !== created.name.trim().toLowerCase());
      setLocalSuppliers(dedupedLocal);
      saveLocalSuppliers(dedupedLocal);
      setSelectedSupplierId(created.id);
      setShowAddSupplier(false);
      resetSupplierDraft();
      toast.success(`${created.name} saved to the supplier database.`);
      void queryClient.invalidateQueries({ queryKey: ["catalog-suppliers"] });
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (error, payload) => {
      const localDraft = createLocalSupplierDraft(payload);
      const next = [
        localDraft,
        ...localSuppliers.filter((supplier) => supplier.name.trim().toLowerCase() !== payload.name.trim().toLowerCase()),
      ];
      setLocalSuppliers(next);
      saveLocalSuppliers(next);
      setSelectedSupplierId(localDraft.id);
      setShowAddSupplier(false);
      resetSupplierDraft();
      toast.success(`${payload.name} added locally for this workspace.`);
      if (error instanceof Error && error.message.trim()) {
        toast.message(error.message);
      }
    },
  });

  const supplierOptions = useMemo(() => {
    const live = suppliers.map((supplier) => ({
      ...supplier,
      channel: products.some((product) => product.supplier_id === supplier.id)
        ? ("API/PunchOut" as SupplierChannel)
        : ("Excel/PDF upload" as SupplierChannel),
    }));

    const seen = new Set(live.map((supplier) => supplier.name.trim().toLowerCase()));
    const manual = localSuppliers.filter((supplier) => !seen.has(supplier.name.trim().toLowerCase()));

    return [...manual, ...live].sort((left, right) => left.name.localeCompare(right.name));
  }, [localSuppliers, products, suppliers]);

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
    setApprovedMappings({});
    setLastImportResult(null);
    previewMutation.mutate({ file, overrides: {} });
  }

  const baseRows = useMemo(() => {
    return products.map((product) => ({
      id: product.id,
      sku: product.sku ?? shortId(product.id),
      name: product.name,
      group: product.category ?? "Uncategorised",
      unit: product.unit ?? "pc",
      pack: product.packaging_qty ? `Pack ${product.packaging_qty}` : "Single",
      supplier: supplierOptions.find((supplier) => supplier.id === product.supplier_id)?.name ?? shortId(product.supplier_id),
      price: Number(product.unit_price ?? 0),
      currency: product.currency ?? "EUR",
      status: product.is_active === false || !product.category ? "needs-review" as const : "mapped" as const,
    }));
  }, [products, supplierOptions]);

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
      const supplierOk = selectedSupplierFilter === "all" || row.supplier === selectedSupplierFilter;
      const query = searchQuery.trim().toLowerCase();
      const numericPrice = Number(row.price ?? 0);
      const haystack = [
        row.id,
        row.sku,
        row.name,
        row.group,
        row.pack,
        row.unit,
        row.supplier,
        row.tradeFit,
        row.variant,
        row.currency,
        numericPrice.toFixed(2),
        Math.round(numericPrice).toString(),
      ].join(" ").toLowerCase();
      const queryOk = !query || haystack.includes(query);
      return tradeOk && standardsOk && supplierOk && queryOk;
    });
  }, [baseRows, selectedTrade, selectedSupplierFilter, standardsOnly, searchQuery]);

  const previewRows = previewMutation.data?.preview_rows ?? [];
  const firstPreviewRow = previewRows[0] ?? null;
  const mappedColumns = previewMutation.data?.mapping?.mappings ?? [];
  const reviewEntries = mappedColumns.map((entry) => {
    const targetField = mappingOverrides[entry.source_column] ?? entry.target_field ?? "";
    return {
      ...entry,
      targetField,
      approved: approvedMappings[entry.source_column] ?? false,
      sampleValue: firstPreviewRow ? renderPreviewValue(firstPreviewRow[entry.source_column]) : "—",
    };
  });
  const previewIssues = reviewEntries.filter((entry) => !entry.targetField).length;
  const pendingApprovalCount = reviewEntries.filter((entry) => entry.targetField && !entry.approved).length;
  const mappedCount = reviewEntries.filter((entry) => entry.targetField).length;
  const approvedCount = reviewEntries.filter((entry) => entry.approved).length;
  const reviewProgress = reviewEntries.length ? Math.round((approvedCount / reviewEntries.length) * 100) : 0;
  const needsReview = previewMutation.data ? previewIssues + pendingApprovalCount : rows.filter((item) => item.status === "needs-review").length;
  const tradeOptions = ["all", "drywall", "electrical", "sanitary", "ppe"];
  const previewReady = Boolean(selectedFile && previewMutation.data && !previewMutation.isPending);
  const hasLiveWarning = productsError || suppliersError;
  const documentType = fileName.toLowerCase().includes("offer")
    ? "Offer / quote"
    : fileName.toLowerCase().includes("contract")
      ? "Framework contract"
      : fileName.toLowerCase().includes("pdf")
        ? "PDF commercial document"
        : "Catalog or price list";
  const isReviewMode = Boolean(selectedFile || previewMutation.data);
  const canImport = Boolean(selectedFile && selectedSupplierId && previewReady && previewIssues === 0 && pendingApprovalCount === 0 && !importMutation.isPending);
  const importBlockedReason = !selectedFile
    ? "Upload a supplier file to start the review workspace."
    : !selectedSupplierId
      ? "Choose the supplier that owns this document."
      : previewMutation.isPending
        ? "Wait while the document is being extracted."
        : previewIssues > 0
          ? "Choose a target field for each extracted column before importing."
          : pendingApprovalCount > 0
            ? "Approve the extracted fields one by one or use Auto approve all."
            : null;

  if (productsLoading && suppliersLoading && products.length === 0 && suppliers.length === 0) {
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

  return (
    <DashboardLayout title="Catalog" subtitle="Normalized C-material assortment across suppliers">
      {hasLiveWarning && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
          <div className="font-medium text-warning-foreground">Live catalog sync warning</div>
          <div className="mt-1 text-muted-foreground">
            Part of the catalog data is temporarily unavailable. The page is still showing the latest live results it could load.
          </div>
          <button
            onClick={() => {
              void refetchProducts();
              void refetchSuppliers();
            }}
            className="mt-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
          >
            Retry live sync
          </button>
        </div>
      )}
      <div className="mb-4 rounded-lg border border-border bg-card p-4 text-sm">
        <div className="font-medium">Live catalog records</div>
        <p className="mt-1 text-muted-foreground">
          All products shown below are loaded from the backend catalog database and supplier imports.
        </p>
      </div>

      <div className="mb-4 rounded-lg border border-border bg-card p-4 text-sm">
        <div className="font-medium">Import checklist</div>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <div className={["rounded-md border px-3 py-2", selectedFile ? "border-success/30 bg-success/10" : "border-border bg-secondary/30"].join(" ")}>
            <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Step 1</div>
            <div className="mt-1 font-medium">Upload the document</div>
          </div>
          <div className={["rounded-md border px-3 py-2", selectedSupplierId ? "border-success/30 bg-success/10" : "border-border bg-secondary/30"].join(" ")}>
            <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Step 2</div>
            <div className="mt-1 font-medium">Assign the supplier</div>
          </div>
          <div className={["rounded-md border px-3 py-2", previewReady ? "border-success/30 bg-success/10" : "border-border bg-secondary/30"].join(" ")}>
            <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Step 3</div>
            <div className="mt-1 font-medium">Approve extracted fields</div>
          </div>
          <div className={["rounded-md border px-3 py-2", canImport ? "border-primary/40 bg-primary/10" : "border-border bg-secondary/30"].join(" ")}>
            <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Step 4</div>
            <div className="mt-1 font-medium">Import into the live catalog</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <label className="rounded-lg border border-dashed border-border bg-card p-5 cursor-pointer hover:bg-accent/40 transition-colors">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 grid place-items-center rounded-md bg-primary text-primary-foreground"><Upload className="h-4 w-4" /></div>
            <div>
              <div className="font-medium text-sm">Upload document</div>
              <div className="text-xs text-muted-foreground">{fileName || "Select PDF, CSV, or Excel to start review"}</div>
            </div>
          </div>
          <input type="file" accept=".csv,.xlsx,.xls,.pdf" className="hidden" onChange={handleFileChange} />
        </label>

        <div className="rounded-lg border border-dashed border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 grid place-items-center rounded-md bg-hivis text-hivis-foreground"><Sparkles className="h-4 w-4" /></div>
            <div className="flex-1">
              <div className="font-medium text-sm">Assign supplier and import</div>
              <select
                value={selectedSupplierId}
                onChange={(event) => handleSupplierSelect(event.target.value)}
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Choose supplier</option>
                <option value="__new__">＋ Add new supplier…</option>
                {supplierOptions.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            {previewMutation.data
              ? `${previewMutation.data.rows_in} rows extracted · ${needsReview} checks remaining`
              : "Upload a document to open the review workspace."}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            {importBlockedReason ?? "Everything is approved and ready to import into the live catalog."}
          </div>
        </div>
      </div>

      {!isReviewMode && (
        <div className="mb-6 rounded-lg border border-border bg-card p-5">
          <div className="font-medium text-sm">Browse live catalog</div>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search name, SKU, supplier, price or article number"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm md:col-span-2"
            />
            <select value={selectedTrade} onChange={(event) => setSelectedTrade(event.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
              {tradeOptions.map((option) => <option key={option} value={option}>{option === "all" ? "All trades" : option}</option>)}
            </select>
            <select value={selectedSupplierFilter} onChange={(event) => setSelectedSupplierFilter(event.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="all">All suppliers</option>
              {supplierOptions.map((supplier) => <option key={supplier.id} value={supplier.name}>{supplier.name}</option>)}
            </select>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={standardsOnly} onChange={(event) => setStandardsOnly(event.target.checked)} />
            Project standard only
          </label>
          <div className="mt-2 text-xs text-muted-foreground">Showing {rows.length} results across names, numbers, suppliers, and prices.</div>
        </div>
      )}

      {isReviewMode && (
        <div className="mb-6 rounded-xl border-2 border-primary/15 bg-card p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">Document review workspace</div>
              <h3 className="text-display text-lg font-semibold">Compare extracted fields with the original file</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Approve each extracted field one by one, or use auto-approve when everything looks correct.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedFile && (
                <button
                  className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
                  onClick={() => previewMutation.mutate({ file: selectedFile, overrides: mappingOverrides })}
                  type="button"
                >
                  Refresh preview
                </button>
              )}
              <button
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
                type="button"
                disabled={reviewEntries.length === 0}
                onClick={() => {
                  setApprovedMappings(Object.fromEntries(reviewEntries.filter((entry) => entry.targetField).map((entry) => [entry.source_column, true])));
                }}
              >
                Auto approve all
              </button>
              <button
                className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                onClick={() => importMutation.mutate()}
                disabled={!canImport}
                type="button"
              >
                {importMutation.isPending ? "Importing…" : "Import approved fields"}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-md border border-border bg-secondary/40 p-3">
              <div className="text-xs text-muted-foreground">Document type</div>
              <div className="mt-1 text-sm font-medium">{documentType}</div>
            </div>
            <div className="rounded-md border border-border bg-secondary/40 p-3">
              <div className="text-xs text-muted-foreground">Rows previewed</div>
              <div className="mt-1 text-sm font-medium">{previewMutation.data?.rows_in ?? 0}</div>
            </div>
            <div className="rounded-md border border-border bg-secondary/40 p-3">
              <div className="text-xs text-muted-foreground">Mapped fields</div>
              <div className="mt-1 text-sm font-medium">{mappedCount}</div>
            </div>
            <div className="rounded-md border border-border bg-secondary/40 p-3">
              <div className="text-xs text-muted-foreground">Still to review</div>
              <div className="mt-1 text-sm font-medium">{needsReview}</div>
            </div>
          </div>

          <div className="mt-3 rounded-md border border-border bg-secondary/30 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">Review progress</div>
                <div className="text-xs text-muted-foreground">{approvedCount} of {reviewEntries.length} extracted fields approved</div>
              </div>
              <div className="text-sm font-semibold">{reviewProgress}%</div>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${reviewProgress}%` }} />
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-border overflow-hidden bg-background min-h-[420px]">
              <div className="border-b border-border px-4 py-3">
                <div className="font-medium text-sm">Original document</div>
                <div className="text-xs text-muted-foreground">Use this panel to compare the extraction with the uploaded file.</div>
              </div>
              {selectedFile && (selectedFile.type === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) ? (
                <iframe title="Uploaded document preview" src={documentPreviewUrl} className="h-[420px] w-full bg-white" />
              ) : previewRows.length > 0 ? (
                <div className="max-h-[420px] overflow-auto p-4">
                  <div className="text-xs text-muted-foreground mb-2">Preview of the uploaded content</div>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary text-left text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        <tr>
                          {Object.keys(previewRows[0] ?? {}).map((key) => (
                            <th key={key} className="px-3 py-2 font-normal">{key}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.slice(0, 8).map((row, index) => (
                          <tr key={`${index}-${JSON.stringify(row)}`} className="border-t border-border">
                            {Object.keys(previewRows[0] ?? {}).map((key) => (
                              <td key={key} className="px-3 py-2 text-muted-foreground">{renderPreviewValue(row[key])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-4 text-sm text-muted-foreground">Upload a document to see a side-by-side preview here.</div>
              )}
            </div>

            <div className="rounded-lg border border-border overflow-hidden bg-background min-h-[420px]">
              <div className="border-b border-border px-4 py-3">
                <div className="font-medium text-sm">Extracted fields</div>
                <div className="text-xs text-muted-foreground">Approve each field, or use Auto approve all at the top.</div>
              </div>
              <div className="max-h-[420px] overflow-auto p-4 space-y-3">
                {previewMutation.isPending ? (
                  <div className="text-sm text-muted-foreground">Extracting fields from the document…</div>
                ) : reviewEntries.length > 0 ? reviewEntries.map((entry) => (
                  <div key={entry.source_column} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground">Source field</div>
                        <div className="font-medium">{entry.source_column}</div>
                      </div>
                      <span className={["rounded-full px-2 py-1 text-[10px] uppercase tracking-wider", entry.approved ? "bg-success/15 text-[oklch(0.42_0.13_155)]" : "bg-warning/20 text-warning-foreground"].join(" ")}>
                        {entry.approved ? "Approved" : "Needs review"}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">Extracted value</div>
                    <div className="mt-1 rounded-md bg-secondary/40 px-3 py-2 text-sm">{entry.sampleValue}</div>
                    <select
                      value={entry.targetField}
                      onChange={(event) => {
                        setMappingOverrides((prev) => ({ ...prev, [entry.source_column]: event.target.value }));
                        setApprovedMappings((prev) => ({ ...prev, [entry.source_column]: false }));
                      }}
                      className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Choose target field</option>
                      {(previewMutation.data?.canonical_fields ?? []).map((field) => (
                        <option key={field} value={field}>{field}</option>
                      ))}
                    </select>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <div className="text-xs text-muted-foreground">Confidence {Math.round((entry.confidence ?? 0) * 100)}% · {entry.reason ?? "AI suggestion"}</div>
                      <button
                        type="button"
                        disabled={!entry.targetField}
                        onClick={() => setApprovedMappings((prev) => ({ ...prev, [entry.source_column]: !entry.approved }))}
                        className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
                      >
                        {entry.approved ? "Undo" : "Approve"}
                      </button>
                    </div>
                  </div>
                )) : (
                  <div className="text-sm text-muted-foreground">No extracted fields are ready yet. Upload a file and wait for the preview.</div>
                )}
              </div>
            </div>
          </div>
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

      {showAddSupplier && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowAddSupplier(false)} />
          <div className="relative w-full max-w-md rounded-xl border border-border bg-background shadow-2xl overflow-hidden">
            <div className="border-b border-border bg-secondary/30 px-6 py-4">
              <div className="text-display text-base font-semibold">Add new supplier</div>
              <div className="mt-1 text-sm text-muted-foreground">Create the supplier and select it for this import.</div>
            </div>
            <div className="space-y-3 px-6 py-5 text-sm">
              <input
                value={draftSupplierName}
                onChange={(event) => setDraftSupplierName(event.target.value)}
                placeholder="Supplier name"
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
              <input
                value={draftSupplierContact}
                onChange={(event) => setDraftSupplierContact(event.target.value)}
                placeholder="Contact person"
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
              <input
                value={draftSupplierEmail}
                onChange={(event) => setDraftSupplierEmail(event.target.value)}
                placeholder="Email"
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
              <input
                value={draftSupplierPhone}
                onChange={(event) => setDraftSupplierPhone(event.target.value)}
                placeholder="Phone"
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSupplier(false);
                    resetSupplierDraft();
                  }}
                  className="rounded-md border border-border px-3 py-2 hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="button"
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

      {!isReviewMode && (
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
              <th className="text-left font-normal px-5 py-3">Price position</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, index) => (
              <tr key={`${item.sku}-${item.supplier}-${index}`} className="border-t border-border hover:bg-secondary/60">
                <td className="px-5 py-3 text-mono text-xs">{item.sku}</td>
                <td className="px-5 py-3 font-medium">
                  {item.name}
                  <div className="text-xs text-muted-foreground">Project fit: {item.tradeFit}</div>
                </td>
                <td className="px-5 py-3 text-muted-foreground">{item.group}</td>
                <td className="px-5 py-3 text-muted-foreground text-xs">{item.pack} · <span className="text-mono">{item.unit}</span></td>
                <td className="px-5 py-3">{item.supplier}</td>
                <td className="px-5 py-3 text-right tabular">{formatCatalogPrice(item.price, item.currency)}</td>
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
                  No catalog records match the current name, number, or supplier filters.
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  );
}
