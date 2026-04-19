import { formatCurrency, shortId, type OrderSummary, type SupplierRecord } from "@/lib/api";

type AssistantContext = {
  orders: OrderSummary[];
  suppliers: SupplierRecord[];
  projectMap: Map<string, string>;
};

function has(text: string, ...keys: string[]) {
  return keys.some((key) => text.includes(key));
}

function currencyOf(context: AssistantContext): string {
  return context.orders[0]?.currency ?? "EUR";
}

function pendingSummary(context: AssistantContext): string {
  const pending = context.orders.filter((order) => ["pending", "pending_approval"].includes(order.status));
  const pendingValue = pending.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);

  if (pending.length === 0) {
    return "There are no live orders waiting for approval right now.";
  }

  return `There are ${pending.length} live orders waiting for approval, worth ${formatCurrency(pendingValue, currencyOf(context))}.`;
}

function spendSummary(context: AssistantContext): string {
  const totalSpend = context.orders.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);
  return `The current live order total is ${formatCurrency(totalSpend, currencyOf(context))} across ${context.orders.length} orders.`;
}

function supplierSummary(context: AssistantContext): string {
  if (context.suppliers.length === 0) {
    return "No supplier records are available yet in the live database.";
  }

  const spendBySupplier = new Map<string, number>();
  context.orders.forEach((order) => {
    const name = order.supplier_name ?? order.items?.[0]?.product_snapshot?.supplier_name ?? "Unknown supplier";
    spendBySupplier.set(name, (spendBySupplier.get(name) ?? 0) + Number(order.total_amount ?? 0));
  });

  const topSupplier = [...spendBySupplier.entries()].sort((left, right) => right[1] - left[1])[0];
  if (!topSupplier) {
    return `There are ${context.suppliers.length} live suppliers in the database.`;
  }

  return `${topSupplier[0]} is currently the top supplier by live spend at ${formatCurrency(topSupplier[1], currencyOf(context))}.`;
}

function projectSummary(context: AssistantContext): string {
  const spendByProject = new Map<string, number>();
  context.orders.forEach((order) => {
    const projectName = context.projectMap.get(order.project_id ?? "") ?? shortId(order.project_id);
    spendByProject.set(projectName, (spendByProject.get(projectName) ?? 0) + Number(order.total_amount ?? 0));
  });

  const topProject = [...spendByProject.entries()].sort((left, right) => right[1] - left[1])[0];
  if (!topProject) {
    return "No live project activity is available yet.";
  }

  return `${topProject[0]} currently has the highest live spend at ${formatCurrency(topProject[1], currencyOf(context))}.`;
}

export function answerQuestion(raw: string, context: AssistantContext): string {
  const q = raw.toLowerCase().trim();
  if (!q) return "Ask about live approvals, spend, suppliers, or project activity.";

  if (context.orders.length === 0 && context.suppliers.length === 0) {
    return "Live dashboard data is still loading or the database is currently empty.";
  }

  if (has(q, "approval", "approve", "pending", "review")) {
    return pendingSummary(context);
  }

  if (has(q, "spend", "spent", "month", "mtd", "kpi", "total", "analytics")) {
    return spendSummary(context);
  }

  if (has(q, "supplier", "vendor", "sync", "catalog source")) {
    return supplierSummary(context);
  }

  if (has(q, "project", "biggest spender", "busiest")) {
    return projectSummary(context);
  }

  return [pendingSummary(context), spendSummary(context), supplierSummary(context)].join("\n\n---\n\n");
}
