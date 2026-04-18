import { kpis, approvals, orders, suppliers, catalog, spendByGroup, spendTrend } from "@/lib/mock-data";

const CHF = (n: number) =>
  new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(n);

const CHF2 = (n: number) =>
  new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(n);

type Match = { score: number; answer: string };

function has(text: string, ...keys: string[]) {
  return keys.some((k) => text.includes(k));
}

function topByTotal<T extends { total: number }>(rows: T[], n = 3) {
  return [...rows].sort((a, b) => b.total - a.total).slice(0, n);
}

export function answerQuestion(raw: string): string {
  const q = raw.toLowerCase().trim();
  if (!q) return "Ask me about pending approvals, spend, suppliers, or how a feature works.";

  const candidates: Match[] = [];

  // ---------- APPROVALS ----------
  if (has(q, "approval", "approve", "pending", "review")) {
    const pending = approvals.filter((a) => a.status === "pending");
    const pendingValue = pending.reduce((s, a) => s + a.total, 0);
    const central = pending.filter((a) => a.threshold === "central");
    const pm = pending.filter((a) => a.threshold === "pm");
    const top = topByTotal(pending, 3);

    let answer =
      `**${pending.length} orders pending approval** worth **${CHF2(pendingValue)}**.\n\n` +
      `- ${central.length} need **Central procurement** (≥ CHF 500)\n` +
      `- ${pm.length} need **PM approval** (CHF 200–499)\n\n`;

    if (top.length) {
      answer += `**Top by value:**\n`;
      top.forEach((a) => {
        answer += `- \`${a.orderRef}\` — ${CHF2(a.total)} · ${a.foreman} · ${a.supplier} (${a.project})\n`;
      });
    }
    answer += `\n💡 *Recommendation:* start with the ${central.length} central items — they block budget the longest.`;
    candidates.push({ score: 10, answer });
  }

  // ---------- SPEND / KPIs ----------
  if (has(q, "spend", "spent", "month", "mtd", "kpi", "total")) {
    const trend = spendTrend.slice(-3).map((t) => `${t.week}: ${CHF(t.spend)}`).join(" → ");
    candidates.push({
      score: 9,
      answer:
        `**Spend MTD: ${CHF(kpis.spendMtd)}** (${kpis.spendDeltaPct > 0 ? "+" : ""}${kpis.spendDeltaPct}% vs last month).\n\n` +
        `Recent weekly trend → ${trend}\n\n` +
        `Top supplier this month: **${kpis.topSupplier}**.\n` +
        `Avg order value: ${CHF2(kpis.avgOrderValue)} across ${kpis.ordersThisWeek} orders this week.`,
    });
  }

  // ---------- BY GROUP / CATEGORY ----------
  if (has(q, "category", "group", "fastener", "consumable", "ppe", "tool", "site supp")) {
    const sorted = [...spendByGroup].sort((a, b) => b.value - a.value);
    let answer = `**Spend by category:**\n`;
    sorted.forEach((g, i) => {
      answer += `${i + 1}. ${g.group} — ${CHF(g.value)}\n`;
    });
    answer += `\n💡 *Recommendation:* ${sorted[0].group} dominates — worth negotiating a framework rebate.`;
    candidates.push({ score: 9, answer });
  }

  // ---------- SUPPLIERS ----------
  if (has(q, "supplier", "vendor", "würth", "wurth", "hilti", "hg", "debrunner", "puag")) {
    const bad = suppliers.filter((s) => s.health !== "good");
    const top = [...suppliers].sort((a, b) => b.spend - a.spend).slice(0, 3);

    let answer = `**Top suppliers by spend:**\n`;
    top.forEach((s) => {
      answer += `- ${s.name} — ${CHF(s.spend)} · ${s.items.toLocaleString()} items · synced ${s.lastSync}\n`;
    });

    if (bad.length) {
      answer += `\n⚠️ **${bad.length} suppliers need attention:**\n`;
      bad.forEach((s) => {
        answer += `- ${s.name} (${s.health === "bad" ? "stale sync" : "warning"}, last sync ${s.lastSync})\n`;
      });
      answer += `\n💡 *Recommendation:* run **Sync now** on ${bad[0].name} from the Suppliers page.`;
    }
    candidates.push({ score: 9, answer });
  }

  // ---------- FOREMAN ----------
  if (has(q, "foreman", "keller", "brunner", "studer", "frei", "who ordered", "biggest order")) {
    const byForeman = new Map<string, number>();
    orders.forEach((o) => byForeman.set(o.foreman, (byForeman.get(o.foreman) ?? 0) + o.total));
    const ranked = [...byForeman.entries()].sort((a, b) => b[1] - a[1]);
    let answer = `**Spend by foreman:**\n`;
    ranked.forEach(([f, v], i) => {
      answer += `${i + 1}. ${f} — ${CHF2(v)}\n`;
    });
    candidates.push({ score: 9, answer });
  }

  // ---------- CATALOG ----------
  if (has(q, "catalog", "item", "sku", "needs review", "mapping", "mapped")) {
    const total = catalog.length;
    const review = catalog.filter((c) => c.status === "needs-review");
    let answer =
      `Catalog has **${total} items**, **${review.length} need review**.\n\n` +
      `💡 *Recommendation:* open Catalog → filter by *needs-review* to map them. ` +
      `You can also bulk-import via Excel/CSV or extract from a PDF contract.`;
    if (review.length) {
      answer += `\n\n**Pending review:**\n`;
      review.forEach((r) => (answer += `- \`${r.sku}\` ${r.name} (${r.supplier})\n`));
    }
    candidates.push({ score: 9, answer });
  }

  // ---------- POLICIES ----------
  if (has(q, "policy", "policies", "threshold", "limit", "auto-approve", "auto approval")) {
    candidates.push({
      score: 8,
      answer:
        `**Approval thresholds:**\n` +
        `- Auto-approved: under **CHF 200**\n` +
        `- PM approval: **CHF 200–499**\n` +
        `- Central procurement: **CHF 500+**\n\n` +
        `Per-foreman daily ceilings and per-category caps are managed in **Policies**. ` +
        `Changes apply to new orders immediately.`,
    });
  }

  // ---------- HOW-TO ----------
  if (has(q, "how do i", "how to", "where do i", "where can i")) {
    if (has(q, "approve")) {
      candidates.push({
        score: 9,
        answer: `Go to **Approvals** → click any row to open the review panel. You'll see the line items, foreman, project, and which threshold triggered the approval. Add an optional note then click **Approve** or **Reject**.`,
      });
    }
    if (has(q, "import", "upload", "excel", "csv", "pdf")) {
      candidates.push({
        score: 9,
        answer: `On **Catalog**, use **Upload Excel/CSV** for supplier price lists or **PDF contract extract** to pull SKUs from framework contracts. The importer shows mapped vs. needs-review items before commit.`,
      });
    }
    if (has(q, "supplier", "sync")) {
      candidates.push({
        score: 9,
        answer: `Open **Suppliers** → click **Sync now** on a row to refresh, or **Settings** to set the auto-sync interval and notification email.`,
      });
    }
  }

  // ---------- DASHBOARD OVERVIEW ----------
  if (has(q, "overview", "summary", "dashboard", "today", "status", "what's happening", "whats happening")) {
    candidates.push({
      score: 8,
      answer:
        `**Today's snapshot:**\n` +
        `- ${kpis.pendingApprovals} approvals pending (${CHF(kpis.pendingValue)})\n` +
        `- Spend MTD: ${CHF(kpis.spendMtd)} (${kpis.spendDeltaPct}% vs last month)\n` +
        `- ${kpis.ordersThisWeek} orders this week, avg ${CHF2(kpis.avgOrderValue)}\n` +
        `- C-materials = ${Math.round(kpis.cMaterialShareOfOrders * 100)}% of order volume\n\n` +
        `Ask me about a supplier, foreman, or category for more detail.`,
    });
  }

  // ---------- HELP ----------
  if (has(q, "help", "what can you", "examples")) {
    candidates.push({
      score: 5,
      answer:
        `I can answer questions about your dashboard. Try:\n` +
        `- *How many approvals are pending?*\n` +
        `- *What's our spend this month?*\n` +
        `- *Which suppliers need attention?*\n` +
        `- *Spend by category*\n` +
        `- *Who's the biggest spender?*\n` +
        `- *How do I import a price list?*`,
    });
  }

  if (candidates.length === 0) {
    return (
      `I'm not sure about that one. I can help with **approvals**, **spend & KPIs**, **suppliers**, ` +
      `**foremen**, **catalog**, and **policies**. Try asking *"What's pending?"* or *"How do I approve an order?"*`
    );
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 2).map((c) => c.answer).join("\n\n---\n\n");
}
