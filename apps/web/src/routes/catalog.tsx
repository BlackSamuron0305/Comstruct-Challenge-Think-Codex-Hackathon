import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/Layout";
import { catalog as initialCatalog, type CatalogItem } from "@/lib/mock-data";
import { Upload, Sparkles, AlertCircle, X, CheckCircle2, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/catalog")({
  head: () => ({
    meta: [
      { title: "Catalog · comstruct C-Materials" },
      { name: "description", content: "Normalized C-material catalog mapped from supplier Excel files, contracts and PunchOut feeds." },
    ],
  }),
  component: Catalog,
});

const CHF = (n: number) =>
  new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", minimumFractionDigits: 2 }).format(n);

// Mock items "parsed" from an Excel upload
const EXCEL_MOCK_ITEMS: CatalogItem[] = [
  { sku: "NEW-WUR-0055", name: "Holzschraube Torx 6×80 verzinkt",      group: "Fasteners > Wood screws", unit: "pc",  pack: "Box / 200", supplier: "Würth Schweiz",   price: 0.09, status: "mapped" },
  { sku: "NEW-WUR-0056", name: "Sechskantschraube M8×50 A2",           group: "Fasteners > Bolts",       unit: "pc",  pack: "Box / 50",  supplier: "Würth Schweiz",   price: 0.24, status: "mapped" },
  { sku: "NEW-WUR-0057", name: "Unterlegscheibe M8 verzinkt",           group: "Fasteners > Washers",     unit: "pc",  pack: "Box / 100", supplier: "Würth Schweiz",   price: 0.04, status: "needs-review" },
  { sku: "NEW-WUR-0058", name: "Mutter M8 selbstsichernd",              group: "Fasteners > Nuts",        unit: "pc",  pack: "Box / 100", supplier: "Würth Schweiz",   price: 0.07, status: "mapped" },
  { sku: "NEW-WUR-0059", name: "Blindniete 4.8×12 Alu/Stahl",          group: "Fasteners > Rivets",      unit: "pc",  pack: "Box / 500", supplier: "Würth Schweiz",   price: 0.03, status: "needs-review" },
];

// Mock items "extracted" from a PDF contract
const PDF_MOCK_ITEMS: CatalogItem[] = [
  { sku: "NEW-PUA-021",  name: "Acryl-Dichtstoff weiss 310ml",          group: "Consumables > Sealants",  unit: "tb",  pack: "Carton/25", supplier: "PUAG AG",         price: 3.80, status: "mapped" },
  { sku: "NEW-PUA-022",  name: "Brandschutzschaum B1 750ml",            group: "Consumables > Sealants",  unit: "can", pack: "Carton/12", supplier: "PUAG AG",         price: 12.40, status: "needs-review" },
  { sku: "NEW-PUA-023",  name: "Universalschaum 750ml low expansion",   group: "Consumables > Sealants",  unit: "can", pack: "Carton/12", supplier: "PUAG AG",         price: 7.20, status: "mapped" },
];

type UploadResult = {
  type: "excel" | "pdf";
  filename: string;
  items: CatalogItem[];
};

function Catalog() {
  const xlsxRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState<"excel" | "pdf" | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [catalogItems, setCatalogItems] = useState(initialCatalog);

  const needsReview = catalogItems.filter((c) => c.status === "needs-review").length;

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessing("excel");
    setTimeout(() => {
      setProcessing(null);
      setUploadResult({ type: "excel", filename: file.name, items: EXCEL_MOCK_ITEMS });
      toast.success(`${file.name} parsed`, {
        description: `${EXCEL_MOCK_ITEMS.length} items found, ${EXCEL_MOCK_ITEMS.filter(i => i.status === "needs-review").length} need review.`,
      });
    }, 900);
    e.target.value = "";
  };

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessing("pdf");
    setTimeout(() => {
      setProcessing(null);
      setUploadResult({ type: "pdf", filename: file.name, items: PDF_MOCK_ITEMS });
      toast.success(`AI parsed ${file.name}`, {
        description: `${PDF_MOCK_ITEMS.length} items extracted from framework contract.`,
      });
    }, 1400);
    e.target.value = "";
  };

  const importItems = () => {
    if (!uploadResult) return;
    // Add only items not already in catalog
    const existingSkus = new Set(catalogItems.map((c) => c.sku));
    const newItems = uploadResult.items.filter((i) => !existingSkus.has(i.sku));
    setCatalogItems((prev) => [...prev, ...newItems]);
    toast.success(`${newItems.length} items added to catalog`);
    setUploadResult(null);
  };

  return (
    <>
      <DashboardLayout title="Catalog" subtitle="Normalized C-material assortment across suppliers">
        {/* Hidden file inputs */}
        <input
          ref={xlsxRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleExcelUpload}
        />
        <input
          ref={pdfRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handlePdfUpload}
        />

        {/* Import strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <button
            onClick={() => xlsxRef.current?.click()}
            disabled={processing !== null}
            className="rounded-lg border border-dashed border-border bg-card p-5 text-left hover:bg-accent/50 transition-colors disabled:opacity-60 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 grid place-items-center rounded-md bg-primary text-primary-foreground shrink-0">
                {processing === "excel" ? (
                  <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
              </div>
              <div>
                <div className="font-medium text-sm">{processing === "excel" ? "Parsing…" : "Upload Excel / CSV"}</div>
                <div className="text-xs text-muted-foreground">Map columns → SKU, price, unit</div>
              </div>
            </div>
          </button>

          <button
            onClick={() => pdfRef.current?.click()}
            disabled={processing !== null}
            className="rounded-lg border border-dashed border-border bg-card p-5 text-left hover:bg-accent/50 transition-colors disabled:opacity-60 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 grid place-items-center rounded-md bg-hivis text-hivis-foreground shrink-0">
                {processing === "pdf" ? (
                  <div className="h-4 w-4 rounded-full border-2 border-hivis-foreground border-t-transparent animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </div>
              <div>
                <div className="font-medium text-sm">{processing === "pdf" ? "Extracting…" : "PDF contract extract"}</div>
                <div className="text-xs text-muted-foreground">AI parses framework prices</div>
              </div>
            </div>
          </button>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 grid place-items-center rounded-md bg-warning/30 text-warning-foreground shrink-0">
                <AlertCircle className="h-4 w-4" />
              </div>
              <div>
                <div className="font-medium text-sm tabular">{needsReview} items need review</div>
                <div className="text-xs text-muted-foreground">Auto-categorization low confidence</div>
              </div>
            </div>
          </div>
        </div>

        {/* Catalog table */}
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
                <th className="text-left font-normal px-5 py-3">Mapping</th>
              </tr>
            </thead>
            <tbody>
              {catalogItems.map((c) => (
                <tr key={c.sku} className="border-t border-border hover:bg-secondary/60">
                  <td className="px-5 py-3 text-mono text-xs">{c.sku}</td>
                  <td className="px-5 py-3 font-medium">{c.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{c.group}</td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">{c.pack} · <span className="text-mono">{c.unit}</span></td>
                  <td className="px-5 py-3">{c.supplier}</td>
                  <td className="px-5 py-3 text-right tabular">{CHF(c.price)}</td>
                  <td className="px-5 py-3">
                    <span className={[
                      "text-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded",
                      c.status === "mapped"
                        ? "bg-success/15 text-[oklch(0.42_0.13_155)]"
                        : "bg-warning/30 text-warning-foreground",
                    ].join(" ")}>
                      {c.status === "mapped" ? "Mapped" : "Needs review"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardLayout>

      {/* Upload result modal */}
      {uploadResult && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20" onClick={() => setUploadResult(null)} />
          <div className="relative bg-background border border-border rounded-xl shadow-2xl w-full max-w-xl overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/30">
              <div className="flex items-center gap-3">
                {uploadResult.type === "excel" ? (
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                ) : (
                  <FileText className="h-5 w-5 text-hivis" />
                )}
                <div>
                  <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {uploadResult.type === "excel" ? "Excel / CSV import" : "PDF contract extract · AI"}
                  </div>
                  <div className="text-sm font-semibold mt-0.5 truncate max-w-xs">{uploadResult.filename}</div>
                </div>
              </div>
              <button onClick={() => setUploadResult(null)} className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Summary */}
            <div className="px-6 py-4 flex gap-4 border-b border-border bg-secondary/10">
              <div className="text-sm">
                <span className="font-semibold">{uploadResult.items.length}</span>
                <span className="text-muted-foreground ml-1">items found</span>
              </div>
              <div className="text-sm">
                <span className="font-semibold text-[oklch(0.42_0.13_155)]">
                  {uploadResult.items.filter(i => i.status === "mapped").length}
                </span>
                <span className="text-muted-foreground ml-1">ready to import</span>
              </div>
              <div className="text-sm">
                <span className="font-semibold text-warning-foreground">
                  {uploadResult.items.filter(i => i.status === "needs-review").length}
                </span>
                <span className="text-muted-foreground ml-1">need review</span>
              </div>
            </div>

            {/* Item list */}
            <div className="overflow-y-auto max-h-72">
              <table className="w-full text-xs">
                <thead className="bg-secondary text-muted-foreground sticky top-0">
                  <tr>
                    <th className="text-left font-normal px-4 py-2">SKU</th>
                    <th className="text-left font-normal px-4 py-2">Name</th>
                    <th className="text-left font-normal px-4 py-2">Group</th>
                    <th className="text-right font-normal px-4 py-2">Price</th>
                    <th className="text-left font-normal px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadResult.items.map((item, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-4 py-2 font-mono">{item.sku}</td>
                      <td className="px-4 py-2">{item.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{item.group}</td>
                      <td className="px-4 py-2 text-right tabular">{CHF(item.price)}</td>
                      <td className="px-4 py-2">
                        {item.status === "mapped" ? (
                          <span className="flex items-center gap-1 text-[oklch(0.42_0.13_155)]">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Mapped
                          </span>
                        ) : (
                          <span className="text-warning-foreground">Needs review</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button
                onClick={() => setUploadResult(null)}
                className="h-9 px-4 rounded-md border border-border text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={importItems}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 flex items-center gap-2"
              >
                <Upload className="h-3.5 w-3.5" /> Import {uploadResult.items.length} items
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
