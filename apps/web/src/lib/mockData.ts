import { type OrderSummary } from './procurement';

export type ProjectRecord = {
  id: string;
  name: string;
  site_address: string;
  trade: string;
  budget: number;
  budgetSpent: number;
  manager: string;
};

export type ApprovalDecision = 'approve' | 'reject';

export type ApprovalRequestRecord = {
  id: string;
  projectId: string;
  requester: {
    name: string;
    role: string;
    team: string;
  };
  item: {
    title: string;
    category: string;
    quantity: string;
    amount: number;
    currency: string;
    needBy: string;
    justification: string;
  };
  supplier: {
    name: string;
    leadTime: string;
    contractStatus: string;
    score: number;
  };
  ai: {
    summary: string;
    recommendedAction: string;
    alternatives: Array<{
      supplier: string;
      price: number;
      reason: string;
      score: number;
    }>;
  };
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
};

export type PolicyRecord = {
  id: string;
  projectId: string;
  name: string;
  category: string;
  rule: string;
  condition: string;
  route: string;
  status: 'active' | 'pilot';
};

export type ContractRecord = {
  id: string;
  supplier: string;
  status: 'Active' | 'Expired' | 'Draft';
  summary: string;
  signed: string;
  expires: string;
  discount: number;
  paymentDays: number;
  minOrder: number;
  owner: string;
  actions: string[];
  projects: string[];
  clauses: Array<{ label: string; value: string }>;
};

export const PROJECTS: ProjectRecord[] = [
  {
    id: 'proj-bridge-stgallen',
    name: 'Bridge St. Gallen',
    site_address: 'Bruckenstrasse 1, 9000 St. Gallen',
    trade: 'Steel Bridge',
    budget: 240000,
    budgetSpent: 128400,
    manager: 'Lea Baumann',
  },
  {
    id: 'proj-zurich-north',
    name: 'Zurich North',
    site_address: 'Thurgauerstrasse 45, 8050 Zurich',
    trade: 'Shell and Core',
    budget: 315000,
    budgetSpent: 201900,
    manager: 'Sven Meier',
  },
  {
    id: 'proj-basel-rehab',
    name: 'Basel Rehab',
    site_address: 'Aeschenplatz 8, 4051 Basel',
    trade: 'Refurbishment',
    budget: 180000,
    budgetSpent: 97450,
    manager: 'Mira Roth',
  },
];

export const ORDERS: OrderSummary[] = [
  {
    id: '8d8b6f81-5b8d-4a73-95c4-111111111111',
    status: 'pending_approval',
    total_amount: '184.50',
    currency: 'EUR',
    foreman_id: 'foreman-001',
    project_id: 'proj-bridge-stgallen',
    created_at: '2026-04-18T08:25:00.000Z',
    notes: 'Anchor bolts and drill bits for pier reinforcement',
  },
  {
    id: '8d8b6f81-5b8d-4a73-95c4-222222222222',
    status: 'delivered',
    total_amount: '92.10',
    currency: 'EUR',
    foreman_id: 'foreman-001',
    project_id: 'proj-bridge-stgallen',
    created_at: '2026-04-17T10:10:00.000Z',
    notes: 'Safety gloves and consumables for welding crew',
  },
  {
    id: '8d8b6f81-5b8d-4a73-95c4-333333333333',
    status: 'ordered',
    total_amount: '148.20',
    currency: 'EUR',
    foreman_id: 'foreman-002',
    project_id: 'proj-bridge-stgallen',
    created_at: '2026-04-16T06:40:00.000Z',
    notes: 'Sealants and fastening kits for deck assembly',
  },
  {
    id: '7f7a5182-4e67-4ca9-9d1d-444444444444',
    status: 'approved',
    total_amount: '126.40',
    currency: 'EUR',
    foreman_id: 'foreman-003',
    project_id: 'proj-zurich-north',
    created_at: '2026-04-18T09:15:00.000Z',
    notes: 'Electrical boxes and cable fixings for level 2',
  },
  {
    id: '7f7a5182-4e67-4ca9-9d1d-555555555555',
    status: 'pending_approval',
    total_amount: '198.90',
    currency: 'EUR',
    foreman_id: 'foreman-003',
    project_id: 'proj-zurich-north',
    created_at: '2026-04-17T13:30:00.000Z',
    notes: 'PPE replenishment for facade access team',
  },
  {
    id: '7f7a5182-4e67-4ca9-9d1d-666666666666',
    status: 'delivered',
    total_amount: '74.30',
    currency: 'EUR',
    foreman_id: 'foreman-004',
    project_id: 'proj-zurich-north',
    created_at: '2026-04-15T11:05:00.000Z',
    notes: 'Site supplies for concrete breakout zone',
  },
  {
    id: '6e6c4073-3156-4d52-8f0e-777777777777',
    status: 'in_transit',
    total_amount: '165.00',
    currency: 'EUR',
    foreman_id: 'foreman-005',
    project_id: 'proj-basel-rehab',
    created_at: '2026-04-18T07:55:00.000Z',
    notes: 'Repair mortar and masking material for corridor works',
  },
  {
    id: '6e6c4073-3156-4d52-8f0e-888888888888',
    status: 'approved',
    total_amount: '118.75',
    currency: 'EUR',
    foreman_id: 'foreman-005',
    project_id: 'proj-basel-rehab',
    created_at: '2026-04-17T08:45:00.000Z',
    notes: 'Cutting discs and protection film for demolition team',
  },
  {
    id: '6e6c4073-3156-4d52-8f0e-999999999999',
    status: 'rejected',
    total_amount: '246.00',
    currency: 'EUR',
    foreman_id: 'foreman-006',
    project_id: 'proj-basel-rehab',
    created_at: '2026-04-15T14:20:00.000Z',
    notes: 'Urgent tooling request moved to procurement review',
  },
];

export const APPROVAL_REQUESTS: ApprovalRequestRecord[] = [
  {
    id: 'APR-1042',
    projectId: 'proj-bridge-stgallen',
    requester: { name: 'Matteo Rossi', role: 'Foreman', team: 'Pier reinforcement' },
    item: {
      title: 'Anchor bolts and drill bits',
      category: 'Fasteners',
      quantity: '12 packs + 4 drill sets',
      amount: 184.5,
      currency: 'EUR',
      needBy: 'Today, 14:00',
      justification: 'Required before the afternoon reinforcement shift starts on pier two.',
    },
    supplier: {
      name: 'Wurth',
      leadTime: 'Same day',
      contractStatus: 'Framework contract active',
      score: 88,
    },
    ai: {
      summary: 'Within historic spend for this crew and aligned with the active fasteners contract.',
      recommendedAction: 'Approve. Cost is below the site threshold and the delivery timing is critical.',
      alternatives: [
        { supplier: 'Fischer', price: 176.2, reason: 'Lower price but next-day delivery.', score: 81 },
        { supplier: 'Bossard', price: 189.4, reason: 'Higher stock depth for future repeat orders.', score: 79 },
      ],
    },
    submittedAt: '2026-04-18T08:25:00.000Z',
    status: 'pending',
  },
  {
    id: 'APR-1043',
    projectId: 'proj-zurich-north',
    requester: { name: 'Nora Schneider', role: 'Foreman', team: 'Facade access' },
    item: {
      title: 'Replacement PPE kits',
      category: 'PPE',
      quantity: '9 kits',
      amount: 198.9,
      currency: 'EUR',
      needBy: 'Tomorrow, 07:00',
      justification: 'Current stock no longer covers the full facade access team for the next shift cycle.',
    },
    supplier: {
      name: 'Uvex',
      leadTime: 'Next morning',
      contractStatus: 'Framework contract active',
      score: 91,
    },
    ai: {
      summary: 'Matches the project PPE policy and stays inside the auto-approve range, but volume is higher than the weekly median.',
      recommendedAction: 'Approve with note. The spend is justified, but ask the requester to confirm weekly forecast accuracy.',
      alternatives: [
        { supplier: '3M', price: 211.6, reason: 'Stronger compliance rating but higher price.', score: 85 },
        { supplier: 'Honeywell', price: 194.1, reason: 'Slightly cheaper with longer lead time.', score: 76 },
      ],
    },
    submittedAt: '2026-04-17T13:30:00.000Z',
    status: 'pending',
  },
  {
    id: 'APR-1040',
    projectId: 'proj-basel-rehab',
    requester: { name: 'Lars Berger', role: 'Foreman', team: 'Demolition' },
    item: {
      title: 'Portable cutting tool set',
      category: 'Tools',
      quantity: '3 units',
      amount: 246,
      currency: 'EUR',
      needBy: 'This week',
      justification: 'Urgent tool replacement request escalated because it sits above the current site rule.',
    },
    supplier: {
      name: 'Hilti',
      leadTime: '2 days',
      contractStatus: 'No project-specific override',
      score: 73,
    },
    ai: {
      summary: 'Value exceeds the current auto-approve limit and the request overlaps with tools already assigned to the demolition team.',
      recommendedAction: 'Reject or defer pending inventory confirmation.',
      alternatives: [
        { supplier: 'Bosch Professional', price: 219, reason: 'Lower cost with acceptable performance score.', score: 78 },
      ],
    },
    submittedAt: '2026-04-15T14:20:00.000Z',
    status: 'rejected',
  },
];

export const POLICIES: PolicyRecord[] = [
  {
    id: 'POL-001',
    projectId: 'proj-bridge-stgallen',
    name: 'Painting consumables auto-approve',
    category: 'Supplies',
    rule: 'Auto-approve up to EUR 200 for painting category requests.',
    condition: 'Only for approved suppliers and same-day delivery.',
    route: 'Above threshold routes to project manager with contract check.',
    status: 'active',
  },
  {
    id: 'POL-002',
    projectId: 'proj-bridge-stgallen',
    name: 'Tool escalation',
    category: 'Tools',
    rule: 'Any single tool order over EUR 120 requires a manager review.',
    condition: 'If duplicate inventory exists on site, request procurement reasoning.',
    route: 'Procurement admin joins review when no contract coverage exists.',
    status: 'pilot',
  },
  {
    id: 'POL-003',
    projectId: 'proj-zurich-north',
    name: 'Facade PPE fast lane',
    category: 'PPE',
    rule: 'Auto-approve up to EUR 220 when safety stock is below minimum.',
    condition: 'Requester must belong to facade or access crew.',
    route: 'Escalate to PM if weekly PPE budget is already 80% consumed.',
    status: 'active',
  },
  {
    id: 'POL-004',
    projectId: 'proj-basel-rehab',
    name: 'Repair material review',
    category: 'Supplies',
    rule: 'Auto-approve repair consumables up to EUR 160.',
    condition: 'Only active during corridor restoration phases.',
    route: 'Late-stage requests move to procurement for bundling with larger orders.',
    status: 'active',
  },
];

export const CONTRACTS: ContractRecord[] = [
  {
    id: 'RV-2024-WR-001',
    supplier: 'Wurth',
    status: 'Active',
    summary: 'Primary fasteners framework with same-day city delivery and rebate tiers.',
    signed: '01 Jan 2024',
    expires: '31 Dec 2026',
    discount: 5,
    paymentDays: 30,
    minOrder: 50,
    owner: 'Procurement Lead',
    actions: ['Renew in Q4 2026', 'Add fastener rebate appendix', 'Review local stock split'],
    projects: ['proj-bridge-stgallen', 'proj-zurich-north', 'proj-basel-rehab'],
    clauses: [
      { label: 'Volume rebate', value: 'Extra 2% from EUR 500 basket size' },
      { label: 'Delivery SLA', value: 'Same-day for stocked city-region items' },
      { label: 'Price review', value: 'Quarterly with indexed steel adjustment' },
    ],
  },
  {
    id: 'RV-2024-FI-003',
    supplier: 'Fischer',
    status: 'Active',
    summary: 'Anchor and fixing agreement for bridge and rehab work with short lead times.',
    signed: '15 Mar 2024',
    expires: '30 Jun 2026',
    discount: 3,
    paymentDays: 14,
    minOrder: 30,
    owner: 'Category Manager',
    actions: ['Prepare extension option', 'Benchmark against Wurth'],
    projects: ['proj-bridge-stgallen', 'proj-basel-rehab'],
    clauses: [
      { label: 'Scope', value: 'Plastic anchors and specialty fixings only' },
      { label: 'Lead time', value: '2 workdays standard' },
      { label: 'Returns', value: 'Unused boxes accepted within 30 days' },
    ],
  },
  {
    id: 'RV-2025-UV-001',
    supplier: 'Uvex',
    status: 'Active',
    summary: 'PPE agreement supporting high-frequency replenishment for active sites.',
    signed: '01 Feb 2025',
    expires: '31 Dec 2026',
    discount: 7,
    paymentDays: 30,
    minOrder: 100,
    owner: 'Safety Procurement',
    actions: ['Add glove size mix annex', 'Track PPE usage variance by project'],
    projects: ['proj-bridge-stgallen', 'proj-zurich-north', 'proj-basel-rehab'],
    clauses: [
      { label: 'Coverage', value: 'Helmets, eyewear, gloves and harness accessories' },
      { label: 'Volume pricing', value: 'Tiered by monthly order count' },
      { label: 'Service', value: 'Dedicated compliance support contact' },
    ],
  },
  {
    id: 'RV-2023-TE-002',
    supplier: 'Tesa',
    status: 'Expired',
    summary: 'Legacy tape and masking agreement awaiting renewal decision.',
    signed: '01 Apr 2023',
    expires: '31 Mar 2026',
    discount: 2,
    paymentDays: 30,
    minOrder: 20,
    owner: 'Procurement Ops',
    actions: ['Decide renewal', 'Move masked items to temporary open-buy list'],
    projects: ['proj-bridge-stgallen'],
    clauses: [
      { label: 'Status note', value: 'Expired, renewal proposal pending' },
      { label: 'Coverage', value: 'Masking and surface prep tapes' },
    ],
  },
];

export function getProjectName(projectId: string | null | undefined): string {
  if (!projectId) return 'Unassigned';
  return PROJECTS.find((project) => project.id === projectId)?.name ?? `Project ${projectId.slice(0, 8)}`;
}
