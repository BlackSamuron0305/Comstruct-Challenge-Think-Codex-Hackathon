import { startTransition, useDeferredValue, useId, useState, type Dispatch, type SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleAlert,
  FileSpreadsheet,
  FileText,
  PencilLine,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Tags,
  UploadCloud,
} from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';

type MappingEntry = {
  source_column: string;
  target_field: string | null;
  confidence?: number;
  reason?: string;
};

type SourceColumn = {
  name: string;
  samples: string[];
};

type IngestPreview = {
  status: string;
  rows_in: number;
  mapping: {
    mappings: MappingEntry[];
    language_detected?: string;
    currency_detected?: string;
    warnings?: string[];
  };
  source_columns: SourceColumn[];
  canonical_fields: string[];
  preview_rows: Array<Record<string, string | number | null>>;
};

type IngestResult = {
  status: string;
  rows_in?: number;
  c_materials?: number;
  excluded?: number;
  excluded_count?: number;
  excluded_samples?: Array<{ name: string; class: string; reason?: string }>;
  upsert_result?: {
    upserted: number;
    skipped_a_class: number;
    errors: string[];
  };
  mapping?: {
    language_detected?: string;
    currency_detected?: string;
    warnings?: string[];
  };
};

type CatalogProduct = {
  id: string;
  supplier_id: string;
  sku: string;
  internal_sku: string;
  name: string;
  description: string | null;
  category: string | null;
  material_class: string;
  unit: string;
  packaging_qty: string;
  unit_price: string;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type CategoryNode = {
  name: string;
  product_count: number;
};

type ProductDraft = {
  name?: string;
  category?: string | null;
  unit?: string;
  packaging_qty?: string;
  unit_price?: string;
  currency?: string;
  is_active?: boolean;
};

const DEFAULT_SUPPLIER_ID = '11111111-1111-1111-1111-111111111111';
const ACCEPTED_FILE_TYPES = 'CSV, XLSX, XLS and PDF';
const DISPLAY_FIELDS = ['sku', 'name', 'category', 'unit', 'unit_price', 'currency'];
const PRICE_MODES = [
  {
    label: 'Contract price',
    detail: 'Default site-wide catalog price from framework agreements.',
  },
  {
    label: 'Discount ladder',
    detail: 'Volume or packaging discounts procurement tracks separately in contract notes.',
  },
  {
    label: 'Project override',
    detail: 'Project-specific price exceptions that need review before broad rollout.',
  },
];

export function IngestPage(): JSX.Element {
  const queryClient = useQueryClient();
  const sourceFileId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [supplierId, setSupplierId] = useState(DEFAULT_SUPPLIER_ID);
  const [preview, setPreview] = useState<IngestPreview | null>(null);
  const [mappingOverrides, setMappingOverrides] = useState<Record<string, string>>({});
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [drafts, setDrafts] = useState<Record<string, ProductDraft>>({});
  const deferredCatalogSearch = useDeferredValue(catalogSearch);

  const categoriesQuery = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: async () => (await api.get<CategoryNode[]>('/api/categories')).data,
  });

  const productsQuery = useQuery({
    queryKey: ['catalog-products', deferredCatalogSearch, selectedCategory],
    queryFn: async () =>
      (
        await api.get<CatalogProduct[]>('/api/products', {
          params: {
            q: deferredCatalogSearch.trim() || undefined,
            category: selectedCategory !== 'all' ? selectedCategory : undefined,
            limit: 25,
          },
        })
      ).data,
  });

  const previewMutation = useMutation({
    mutationFn: async ({
      selectedFile,
      mappings,
    }: {
      selectedFile: File;
      mappings?: MappingEntry[];
    }) => {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (mappings && mappings.length > 0) {
        formData.append('mapping_overrides', JSON.stringify(mappings));
      }
      const response = await api.post<IngestPreview>('/api/ingest/preview', formData);
      return response.data;
    },
    onSuccess: (data) => {
      const nextOverrides: Record<string, string> = {};
      for (const mapping of data.mapping.mappings) {
        nextOverrides[mapping.source_column] = mapping.target_field ?? '';
      }
      setPreview(data);
      setMappingOverrides(nextOverrides);
      setResult(null);
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('A file is required before import can start.');
      const formData = new FormData();
      formData.append('supplier_id', supplierId);
      formData.append('default_currency', 'EUR');
      formData.append('file', file);
      formData.append('mapping_overrides', JSON.stringify(buildMappingPayload(preview, mappingOverrides)));
      const response = await api.post<IngestResult>('/api/ingest/supplier-file', formData);
      return response.data;
    },
    onSuccess: async (data) => {
      setResult(data);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['catalog-products'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog-categories'] }),
      ]);
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ productId, payload }: { productId: string; payload: ProductDraft }) => {
      const response = await api.patch<CatalogProduct>(`/api/products/${productId}`, normaliseDraft(payload));
      return response.data;
    },
    onSuccess: async (_, variables) => {
      setDrafts((current) => {
        const next = { ...current };
        delete next[variables.productId];
        return next;
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['catalog-products'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog-categories'] }),
      ]);
    },
  });

  const previewColumns = preview
    ? DISPLAY_FIELDS.filter((field) =>
        preview.preview_rows.some((row) => row[field] !== undefined && row[field] !== null && row[field] !== ''),
      )
    : DISPLAY_FIELDS;
  const mappedColumns = preview
    ? preview.source_columns.filter((column) => Boolean(mappingOverrides[column.name])).length
    : 0;
  const categoryOptions = categoriesQuery.data ?? [];
  const products = productsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden p-0">
        <div className="grid gap-0 xl:grid-cols-[1.02fr_0.98fr]">
          <div className="relative overflow-hidden p-6 lg:p-8">
            <div className="absolute inset-x-8 top-0 h-40 rounded-full bg-white/30 blur-3xl" />
            <div className="relative">
              <div className="panel-title">Catalog intake</div>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/70 px-3 py-1 text-xs font-medium text-brand">
                <Sparkles size={14} />
                Review-first import workflow
              </div>
              <h1 className="mt-5 max-w-2xl text-4xl font-bold tracking-[-0.04em] text-slate-900 lg:text-5xl">
                Bring supplier price lists into a tidy C-material catalog
              </h1>
              <p className="mt-4 max-w-xl text-base leading-8 text-slate-600">
                Analyze spreadsheets or PDFs, confirm the mapping before import, and
                clean up live catalog items without leaving the page.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <QuickStat label="Formats supported" value="4" detail={ACCEPTED_FILE_TYPES} />
                <QuickStat label="Review mode" value="Manual + AI" detail="Procurement can override each mapped column" />
                <QuickStat label="Catalog scope" value="C-materials" detail="Consumables, PPE, fasteners, tapes and similar items" />
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <IngestHint
                  icon={<FileSpreadsheet size={18} />}
                  title="Excel and CSV"
                  text="Upload framework lists with SKU, description, price, unit and packaging fields."
                />
                <IngestHint
                  icon={<FileText size={18} />}
                  title="Contract PDFs"
                  text="Preview printed offers or contract sheets before they touch the catalog."
                />
                <IngestHint
                  icon={<Tags size={18} />}
                  title="Cleanup workbench"
                  text="Rename, regroup and deactivate products directly after the import lands."
                />
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 bg-white/60 p-6 backdrop-blur xl:border-l xl:border-t-0 lg:p-8">
            <div className="mx-auto max-w-xl rounded-[28px] border border-white/40 bg-white/75 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] lg:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="panel-title">Step 1 of 3</div>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900">
                    Analyze a supplier file
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Start with a file preview so procurement can inspect the mapping before any product is imported.
                  </p>
                </div>
                <div className="hidden rounded-2xl bg-brand-accent/25 p-3 text-brand lg:block">
                  <UploadCloud size={22} />
                </div>
              </div>

              <div className="mt-6 space-y-5">
                <div>
                  <label
                    htmlFor="supplier-id"
                    className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500"
                  >
                    Supplier ID
                  </label>
                  <input
                    id="supplier-id"
                    className="mt-2 w-full rounded-[18px] border border-brand-line bg-white px-4 py-3 text-sm font-mono text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
                    style={{ backgroundColor: '#FFFFFF' }}
                    value={supplierId}
                    onChange={(event) => setSupplierId(event.target.value)}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor={sourceFileId}
                      className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500"
                    >
                      Source file
                    </label>
                    <span className="text-xs text-slate-500">{ACCEPTED_FILE_TYPES}</span>
                  </div>

                  <label
                    htmlFor={sourceFileId}
                    className={cn(
                      'mt-2 flex cursor-pointer items-center gap-4 rounded-[22px] border border-dashed bg-brand-surface/80 px-4 py-4 transition',
                      file
                        ? 'border-brand/40 bg-brand-accent/10 shadow-[0_12px_32px_rgba(45,112,128,0.12)]'
                        : 'border-brand-line hover:border-brand/30 hover:bg-white',
                    )}
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-brand-surface">
                      <UploadCloud size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {file ? file.name : 'Choose a file to analyze'}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        {file
                          ? `${Math.max(1, Math.round(file.size / 1024))} KB selected`
                          : 'Drop in a supplier sheet or browse from your device'}
                      </div>
                    </div>
                    <div className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-brand shadow-sm">
                      Browse
                    </div>
                  </label>
                  <input
                    id={sourceFileId}
                    type="file"
                    accept=".csv,.xlsx,.xls,.pdf"
                    onChange={(event) => {
                      setFile(event.target.files?.[0] ?? null);
                      setPreview(null);
                      setResult(null);
                      setError(null);
                    }}
                    className="sr-only"
                  />
                </div>

                <div className="rounded-[22px] border border-brand-line/80 bg-brand-surface/80 p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-xl bg-brand-accent/25 p-2 text-brand">
                      <ShieldCheck size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Pricing structure guide</div>
                      <div className="mt-2 grid gap-2">
                        {PRICE_MODES.map((mode) => (
                          <div key={mode.label} className="rounded-[14px] bg-white/80 px-4 py-3">
                            <div className="text-sm font-semibold text-slate-900">{mode.label}</div>
                            <div className="mt-1 text-sm leading-6 text-slate-600">{mode.detail}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full justify-center rounded-[18px] py-3.5 text-base shadow-[0_18px_35px_rgba(45,112,128,0.28)]"
                  disabled={!file || previewMutation.isPending}
                  onClick={async () => {
                    if (!file) return;
                    setError(null);
                    try {
                      await previewMutation.mutateAsync({ selectedFile: file });
                    } catch (caught) {
                      setError(toErrorMessage(caught, 'File analysis failed'));
                    }
                  }}
                >
                  {previewMutation.isPending ? 'Analyzing file…' : 'Analyze file'}
                </Button>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <CircleAlert size={14} />
                  Analyze first, then confirm mappings before the catalog import starts.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-[18px] border border-red-500/20 bg-red-100 px-4 py-3 text-sm text-brand-err">
          {error}
        </div>
      )}

      {preview && (
        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="card p-5 lg:p-6">
            <div className="flex flex-col gap-3 border-b border-brand-line pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="panel-title">Step 2 of 3</div>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">Review column mapping</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  AI suggestions are editable. Unmap anything that should stay outside the normalized catalog model.
                </p>
              </div>
              <div className="rounded-full bg-brand-accent/25 px-3 py-2 text-sm font-medium text-brand">
                {mappedColumns}/{preview.source_columns.length} mapped
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
              <Stat label="Rows sampled" value={preview.rows_in} />
              <Stat label="Detected language" value={preview.mapping.language_detected ?? '-'} />
              <Stat label="Detected currency" value={preview.mapping.currency_detected ?? '-'} />
              <Stat label="Warnings" value={preview.mapping.warnings?.length ?? 0} accent />
            </div>

            <div className="mt-5 space-y-3">
              {preview.source_columns.map((column) => {
                const currentValue = mappingOverrides[column.name] ?? '';
                return (
                  <div key={column.name} className="rounded-[18px] border border-brand-line bg-brand-card/60 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900">{column.name}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {column.samples.length > 0 ? (
                            column.samples.map((sample) => (
                              <span
                                key={`${column.name}-${sample}`}
                                className="rounded-full bg-white px-3 py-1 text-xs text-slate-600"
                              >
                                {sample}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-500">No sample values</span>
                          )}
                        </div>
                      </div>

                      <div className="w-full lg:w-64">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Target field
                        </label>
                        <select
                          value={currentValue}
                          onChange={(event) =>
                            setMappingOverrides((current) => ({
                              ...current,
                              [column.name]: event.target.value,
                            }))
                          }
                          className="mt-2 w-full rounded-[16px] border border-brand-line bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
                        >
                          <option value="">Skip this column</option>
                          {preview.canonical_fields.map((field) => (
                            <option key={field} value={field}>
                              {field}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-brand-line px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="panel-title">Normalized preview</div>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">What the catalog will receive</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Preview uses the current mapping choices before import and classification run.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="rounded-[18px] px-5"
                  disabled={!file || previewMutation.isPending}
                  onClick={async () => {
                    if (!file) return;
                    setError(null);
                    try {
                      await previewMutation.mutateAsync({
                        selectedFile: file,
                        mappings: buildMappingPayload(preview, mappingOverrides),
                      });
                    } catch (caught) {
                      setError(toErrorMessage(caught, 'Preview refresh failed'));
                    }
                  }}
                >
                  {previewMutation.isPending ? 'Refreshing…' : 'Refresh preview'}
                </Button>
                <Button
                  className="rounded-[18px] px-5"
                  disabled={!file || importMutation.isPending}
                  onClick={async () => {
                    if (!file) return;
                    setError(null);
                    try {
                      await importMutation.mutateAsync();
                    } catch (caught) {
                      setError(toErrorMessage(caught, 'Catalog import failed'));
                    }
                  }}
                >
                  {importMutation.isPending ? 'Importing catalog…' : 'Import catalog'}
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-brand-surface/70 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    {previewColumns.map((column) => (
                      <th key={column} className="px-4 py-3">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.preview_rows.map((row, index) => (
                    <tr key={`${row.sku ?? row.name ?? 'row'}-${index}`} className="border-t border-brand-line">
                      {previewColumns.map((column) => (
                        <td
                          key={`${column}-${index}`}
                          className={`px-4 py-3 ${column === 'sku' || column === 'unit_price' ? 'font-mono' : ''}`}
                        >
                          {row[column] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {preview.preview_rows.length === 0 && (
                    <tr>
                      <td colSpan={previewColumns.length || 1} className="px-4 py-8 text-center text-slate-500">
                        No normalized rows are available for preview yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {preview.mapping.warnings && preview.mapping.warnings.length > 0 && (
              <div className="border-t border-brand-line bg-amber-50 px-6 py-4 text-sm text-amber-900">
                {preview.mapping.warnings.join(' · ')}
              </div>
            )}
          </div>
        </section>
      )}

      {result && (
        <div className="card max-w-5xl p-5 lg:p-6">
          <div className="flex flex-col gap-2 border-b border-brand-line pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="panel-title">Step 3 of 3</div>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">Catalog import summary</h2>
            </div>
            <div className="rounded-full bg-brand-accent/25 px-3 py-2 text-sm font-medium text-brand">
              Status: {result.status}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
            <Stat label="Rows seen" value={result.rows_in ?? 0} />
            <Stat label="C-materials kept" value={result.c_materials ?? 0} accent />
            <Stat label="Excluded" value={result.excluded ?? result.excluded_count ?? 0} />
            <Stat label="Detected language" value={result.mapping?.language_detected ?? '-'} />
          </div>
          {result.upsert_result && (
            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <Stat label="Upserted" value={result.upsert_result.upserted} />
              <Stat label="Skipped A/B" value={result.upsert_result.skipped_a_class} />
              <Stat label="Errors" value={result.upsert_result.errors.length} />
            </div>
          )}
          {result.excluded_samples && result.excluded_samples.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-medium">
                Excluded samples (outside C-material scope)
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {result.excluded_samples.map((sample, index) => (
                  <li key={`${sample.name}-${index}`}>
                    <span className="font-medium">{sample.class}</span> - {sample.name}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {result.upsert_result && result.upsert_result.errors.length > 0 && (
            <div className="mt-4 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {result.upsert_result.errors.join(' · ')}
            </div>
          )}
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-brand-line px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="panel-title">Catalog cleanup</div>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">Procurement admin workbench</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Search imported C-materials, rename items, regroup categories and deactivate noisy rows.
            </p>
          </div>
          <div className="rounded-full bg-brand-surface px-3 py-2 text-sm text-slate-600">
            {products.length} visible products
          </div>
        </div>

        <div className="grid gap-4 border-b border-brand-line px-6 py-5 lg:grid-cols-[minmax(0,1fr)_220px]">
          <label className="relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              value={catalogSearch}
              onChange={(event) =>
                startTransition(() => {
                  setCatalogSearch(event.target.value);
                })
              }
              placeholder="Search by name or SKU…"
              className="w-full rounded-[18px] border border-brand-line bg-white py-3 pl-10 pr-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </label>

          <select
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.target.value)}
            className="rounded-[18px] border border-brand-line bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
          >
            <option value="all">All categories</option>
            {categoryOptions.map((category) => (
              <option key={category.name} value={category.name}>
                {category.name} ({category.product_count})
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-brand-surface/70 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Packaging</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const draft = drafts[product.id] ?? {};
                const categoryChoices = [
                  ...new Set(
                    [
                      product.category ?? '',
                      draft.category ?? '',
                      ...categoryOptions.map((category) => category.name),
                    ].filter(Boolean),
                  ),
                ];
                const isSaving = updateProductMutation.isPending && updateProductMutation.variables?.productId === product.id;
                return (
                  <tr key={product.id} className="border-t border-brand-line align-top">
                    <td className="px-4 py-4">
                      <div className="space-y-2">
                        <input
                          value={draft.name ?? product.name}
                          onChange={(event) => updateDraft(setDrafts, product.id, 'name', event.target.value)}
                          className="w-full rounded-[14px] border border-brand-line bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
                        />
                        <div className="text-xs text-slate-500">
                          SKU {product.sku} · internal {product.internal_sku}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <select
                        value={draft.category ?? product.category ?? ''}
                        onChange={(event) => updateDraft(setDrafts, product.id, 'category', event.target.value || null)}
                        className="w-full rounded-[14px] border border-brand-line bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
                      >
                        <option value="">Uncategorized</option>
                        {categoryChoices.map((category) => (
                          <option key={`${product.id}-${category}`} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-4">
                      <input
                        value={draft.unit ?? product.unit}
                        onChange={(event) => updateDraft(setDrafts, product.id, 'unit', event.target.value)}
                        className="w-24 rounded-[14px] border border-brand-line bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <input
                        value={draft.packaging_qty ?? product.packaging_qty}
                        onChange={(event) => updateDraft(setDrafts, product.id, 'packaging_qty', event.target.value)}
                        className="w-28 rounded-[14px] border border-brand-line bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <input
                          value={draft.unit_price ?? product.unit_price}
                          onChange={(event) => updateDraft(setDrafts, product.id, 'unit_price', event.target.value)}
                          className="w-28 rounded-[14px] border border-brand-line bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
                        />
                        <input
                          value={draft.currency ?? product.currency}
                          onChange={(event) => updateDraft(setDrafts, product.id, 'currency', event.target.value.toUpperCase())}
                          className="w-20 rounded-[14px] border border-brand-line bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => updateDraft(setDrafts, product.id, 'is_active', !(draft.is_active ?? product.is_active))}
                        className={cn(
                          'inline-flex rounded-full px-3 py-1 text-xs font-semibold transition',
                          (draft.is_active ?? product.is_active)
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-600',
                        )}
                      >
                        {(draft.is_active ?? product.is_active) ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Button
                        variant="outline"
                        className="rounded-[16px] px-4 py-2"
                        disabled={isSaving}
                        onClick={async () => {
                          const payload = drafts[product.id];
                          if (!payload || Object.keys(payload).length === 0) return;
                          setError(null);
                          try {
                            await updateProductMutation.mutateAsync({ productId: product.id, payload });
                          } catch (caught) {
                            setError(toErrorMessage(caught, 'Saving product changes failed'));
                          }
                        }}
                      >
                        {isSaving ? <Save size={14} /> : <PencilLine size={14} />}
                        {isSaving ? 'Saving…' : 'Save'}
                      </Button>
                    </td>
                  </tr>
                );
              })}

              {productsQuery.isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Loading catalog products…
                  </td>
                </tr>
              )}

              {!productsQuery.isLoading && products.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No products match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function buildMappingPayload(
  preview: IngestPreview | null,
  mappingOverrides: Record<string, string>,
): MappingEntry[] {
  if (!preview) return [];
  return preview.source_columns.map((column) => ({
    source_column: column.name,
    target_field: mappingOverrides[column.name] || null,
    confidence: 1,
    reason: mappingOverrides[column.name] ? 'confirmed in web mapping assistant' : 'skipped in web mapping assistant',
  }));
}

function normaliseDraft(draft: ProductDraft): ProductDraft {
  const next: ProductDraft = {};

  if (draft.name !== undefined) next.name = draft.name.trim();
  if (draft.category !== undefined) next.category = draft.category ? draft.category.trim() : null;
  if (draft.unit !== undefined) next.unit = draft.unit.trim();
  if (draft.packaging_qty !== undefined) next.packaging_qty = draft.packaging_qty.trim();
  if (draft.unit_price !== undefined) next.unit_price = draft.unit_price.trim();
  if (draft.currency !== undefined) next.currency = draft.currency.trim().toUpperCase();
  if (draft.is_active !== undefined) next.is_active = draft.is_active;

  return next;
}

function updateDraft(
  setDrafts: Dispatch<SetStateAction<Record<string, ProductDraft>>>,
  productId: string,
  field: keyof ProductDraft,
  value: string | boolean | null,
): void {
  setDrafts((current) => ({
    ...current,
    [productId]: {
      ...current[productId],
      [field]: value,
    },
  }));
}

function toErrorMessage(caught: unknown, fallback: string): string {
  if (typeof caught === 'object' && caught !== null && 'response' in caught) {
    const response = (caught as { response?: { data?: { detail?: string } } }).response;
    if (response?.data?.detail) return response.data.detail;
  }
  return caught instanceof Error ? caught.message : fallback;
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}): JSX.Element {
  return (
    <div
      className={`rounded-[12px] border border-brand-line p-4 ${
        accent ? 'bg-brand-accent/10' : 'bg-brand-card/70'
      }`}
    >
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function QuickStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}): JSX.Element {
  return (
    <div className="rounded-[18px] border border-white/20 bg-white/70 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-sm leading-6 text-slate-600">{detail}</div>
    </div>
  );
}

function IngestHint({
  icon,
  title,
  text,
}: {
  icon: JSX.Element;
  title: string;
  text: string;
}): JSX.Element {
  return (
    <div className="rounded-[22px] border border-white/20 bg-white/70 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-brand text-brand-surface">
        {icon}
      </div>
      <div className="mt-4 text-base font-semibold text-brand">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}
