type Match = { score: number; answer: string };

function has(text: string, ...keys: string[]) {
  return keys.some((key) => text.includes(key));
}

export function answerQuestion(raw: string): string {
  const q = raw.toLowerCase().trim();
  if (!q) return "Ask about approvals, spend, suppliers, catalog imports, or demand statistics.";

  const candidates: Match[] = [];

  if (has(q, "approval", "approve", "pending", "review")) {
    candidates.push({
      score: 10,
      answer:
        "Use the live Approvals view to review statistically unusual orders. C-material requests are now checked against historical product-family demand instead of fixed CHF thresholds.",
    });
  }

  if (has(q, "spend", "spent", "month", "mtd", "kpi", "total", "analytics")) {
    candidates.push({
      score: 9,
      answer:
        "Open Overview or Analytics for the live spend metrics. Those screens now aggregate real order totals, supplier share, and weekly trend data from the gateway.",
    });
  }

  if (has(q, "category", "group", "fastener", "consumable", "ppe", "tool")) {
    candidates.push({
      score: 8,
      answer:
        "The Analytics page breaks spend down by product group using the current line-item snapshots from order history.",
    });
  }

  if (has(q, "supplier", "vendor", "sync", "catalog source")) {
    candidates.push({
      score: 9,
      answer:
        "The Suppliers page now reads from the live supplier and product catalog. Use Sync now for a refresh prompt and open Settings to inspect the supplier record.",
    });
  }

  if (has(q, "catalog", "item", "sku", "mapping", "pdf", "excel", "csv", "import")) {
    candidates.push({
      score: 9,
      answer:
        "Use Catalog to upload Excel or CSV price lists, or run the PDF extraction flow. The importer previews mappings before ingest so procurement can review mismatches safely.",
    });
  }

  if (has(q, "policy", "threshold", "limit", "auto-approve", "auto approval", "statistics", "erwartungswert", "stddev")) {
    candidates.push({
      score: 8,
      answer:
        "The Statistics view shows Erwartungswert, Standardabweichung, and AI product tags for each C-item family. Normal requests auto-pass; only anomalies are routed for review.",
    });
  }

  if (has(q, "how do i", "how to", "where do i", "where can i", "help", "examples")) {
    candidates.push({
      score: 7,
      answer:
        "Try asking: How do I approve an order? Which page shows live spend? How do I import a supplier file? Which suppliers need attention?",
    });
  }

  if (candidates.length === 0) {
    return "I can help with approvals, spend visibility, suppliers, catalog imports, and demand statistics.";
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 2).map((candidate) => candidate.answer).join("\n\n---\n\n");
}
