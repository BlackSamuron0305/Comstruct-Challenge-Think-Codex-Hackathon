export type OrderStatus = "draft" | "pending" | "approved" | "ordered" | "delivered" | "rejected";

export type Approval = {
  id: string;
  orderRef: string;
  project: string;
  foreman: string;
  supplier: string;
  items: number;
  total: number;
  submittedAt: string;
  threshold: "auto" | "pm" | "central";
  status: OrderStatus;
};

export type Order = {
  id: string;
  ref: string;
  project: string;
  foreman: string;
  supplier: string;
  items: number;
  total: number;
  status: OrderStatus;
  date: string;
};

export type CatalogItem = {
  sku: string;
  name: string;
  group: string;
  unit: string;
  pack: string;
  supplier: string;
  price: number;
  status: "mapped" | "needs-review";
};

export type Supplier = {
  id: string;
  name: string;
  channel: "Excel upload" | "API/PunchOut" | "EDI" | "Email";
  items: number;
  spend: number;
  lastSync: string;
  health: "good" | "warn" | "bad";
};

export const kpis = {
  pendingApprovals: 14,
  pendingValue: 8420,
  spendMtd: 48230,
  spendDeltaPct: -6.2,
  ordersThisWeek: 87,
  avgOrderValue: 142,
  topSupplier: "Würth Schweiz",
  cMaterialShareOfOrders: 0.61,
};

export const approvals: Approval[] = [
  { id: "a1", orderRef: "C-24109", project: "Letzigrund Tower B", foreman: "M. Keller",   supplier: "Würth Schweiz",       items: 12, total: 312.40, submittedAt: "08:42",  threshold: "pm",      status: "pending" },
  { id: "a2", orderRef: "C-24108", project: "Sihlcity Refit",     foreman: "A. Brunner",  supplier: "HG Commerciale",      items: 5,  total: 184.00, submittedAt: "08:21",  threshold: "auto",    status: "approved" },
  { id: "a3", orderRef: "C-24107", project: "Letzigrund Tower B", foreman: "M. Keller",   supplier: "Hilti Schweiz",       items: 3,  total: 612.90, submittedAt: "07:58",  threshold: "central", status: "pending" },
  { id: "a4", orderRef: "C-24106", project: "Hardbrücke Depot",   foreman: "L. Studer",   supplier: "Debrunner Acifer",    items: 22, total: 487.10, submittedAt: "Yesterday", threshold: "pm",  status: "pending" },
  { id: "a5", orderRef: "C-24105", project: "Hardbrücke Depot",   foreman: "L. Studer",   supplier: "Würth Schweiz",       items: 8,  total: 96.20,  submittedAt: "Yesterday", threshold: "auto", status: "approved" },
  { id: "a6", orderRef: "C-24104", project: "Oerlikon School",    foreman: "R. Frei",     supplier: "PUAG AG",             items: 14, total: 921.50, submittedAt: "Yesterday", threshold: "central", status: "pending" },
  { id: "a7", orderRef: "C-24103", project: "Oerlikon School",    foreman: "R. Frei",     supplier: "HG Commerciale",      items: 6,  total: 142.80, submittedAt: "2d ago", threshold: "pm",      status: "rejected" },
  { id: "a8", orderRef: "C-24102", project: "Sihlcity Refit",     foreman: "A. Brunner",  supplier: "Hilti Schweiz",       items: 4,  total: 268.00, submittedAt: "2d ago", threshold: "pm",      status: "pending" },
];

export const orders: Order[] = approvals.map((a) => ({
  id: a.id, ref: a.orderRef, project: a.project, foreman: a.foreman, supplier: a.supplier,
  items: a.items, total: a.total, status: a.status, date: a.submittedAt,
})).concat([
  { id: "o9",  ref: "C-24095", project: "Letzigrund Tower B", foreman: "M. Keller",  supplier: "Würth Schweiz",    items: 9,  total: 218.40, status: "delivered", date: "3d ago" },
  { id: "o10", ref: "C-24094", project: "Sihlcity Refit",     foreman: "A. Brunner", supplier: "Debrunner Acifer", items: 11, total: 342.10, status: "ordered",   date: "3d ago" },
  { id: "o11", ref: "C-24093", project: "Hardbrücke Depot",   foreman: "L. Studer",  supplier: "PUAG AG",          items: 4,  total: 78.50,  status: "delivered", date: "4d ago" },
]);

export const catalog: CatalogItem[] = [
  { sku: "WUR-0042-45", name: "Spanplattenschraube Torx 4.5×40",    group: "Fasteners > Wood screws",  unit: "pc",  pack: "Box / 500", supplier: "Würth Schweiz",     price: 0.06, status: "mapped" },
  { sku: "WUR-0091-30", name: "Dübel Nylon UX 8×50",                 group: "Fasteners > Anchors",      unit: "pc",  pack: "Box / 100", supplier: "Würth Schweiz",     price: 0.18, status: "mapped" },
  { sku: "HIL-TAPE-19", name: "Gewebeband silber 19mm × 50m",        group: "Consumables > Tapes",      unit: "rl",  pack: "Roll",      supplier: "Hilti Schweiz",     price: 5.40, status: "mapped" },
  { sku: "HG-PPE-G09",  name: "Arbeitshandschuhe Nitril Gr. 9",      group: "PPE > Gloves",             unit: "pr",  pack: "Pair / 12", supplier: "HG Commerciale",    price: 1.90, status: "mapped" },
  { sku: "HG-PPE-M01",  name: "FFP2 Atemschutzmaske",                group: "PPE > Respiratory",        unit: "pc",  pack: "Box / 20",  supplier: "HG Commerciale",    price: 0.85, status: "mapped" },
  { sku: "DEB-DR-6",    name: "Bohrer SDS-Plus 6×160",               group: "Tools > Drill bits",       unit: "pc",  pack: "Single",    supplier: "Debrunner Acifer",  price: 4.20, status: "mapped" },
  { sku: "PUA-FOAM-1",  name: "PU-Schaum 750ml Standard",             group: "Consumables > Sealants",   unit: "can", pack: "Carton/12", supplier: "PUAG AG",           price: 6.80, status: "needs-review" },
  { sku: "PUA-SIL-310", name: "Silikon sanitär weiss 310ml",          group: "Consumables > Sealants",   unit: "tb",  pack: "Carton/25", supplier: "PUAG AG",           price: 4.10, status: "needs-review" },
  { sku: "WUR-BAT-AA",  name: "Batterie Alkaline AA",                 group: "Site supplies > Batteries",unit: "pc",  pack: "Pack / 4",  supplier: "Würth Schweiz",     price: 0.65, status: "mapped" },
];

export const suppliers: Supplier[] = [
  { id: "s1", name: "Würth Schweiz",      channel: "API/PunchOut",  items: 12480, spend: 18420, lastSync: "12 min ago", health: "good" },
  { id: "s2", name: "Hilti Schweiz",      channel: "EDI",           items: 8210,  spend: 9320,  lastSync: "1 h ago",    health: "good" },
  { id: "s3", name: "HG Commerciale",     channel: "Excel upload",  items: 3140,  spend: 6210,  lastSync: "Yesterday",  health: "warn" },
  { id: "s4", name: "Debrunner Acifer",   channel: "Email",         items: 2890,  spend: 5840,  lastSync: "2d ago",     health: "warn" },
  { id: "s5", name: "PUAG AG",            channel: "Excel upload",  items: 1240,  spend: 4120,  lastSync: "5d ago",     health: "bad" },
];

export const spendByGroup = [
  { group: "Fasteners",   value: 14200 },
  { group: "Consumables", value: 11800 },
  { group: "PPE",         value: 9200 },
  { group: "Tools",       value: 7400 },
  { group: "Site supp.",  value: 5630 },
];

export const spendTrend = [
  { week: "W12", spend: 9800 },
  { week: "W13", spend: 11200 },
  { week: "W14", spend: 10400 },
  { week: "W15", spend: 12800 },
  { week: "W16", spend: 11900 },
  { week: "W17", spend: 13100 },
  { week: "W18", spend: 12400 },
];

export const projects = [
  "Letzigrund Tower B",
  "Sihlcity Refit",
  "Hardbrücke Depot",
  "Oerlikon School",
];

export function statusLabel(s: OrderStatus) {
  return ({ draft: "Draft", pending: "Pending", approved: "Approved", ordered: "Ordered", delivered: "Delivered", rejected: "Rejected" } as const)[s];
}
