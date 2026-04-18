import type { OrderStatus } from "@/lib/mock-data";
import { statusLabel } from "@/lib/mock-data";

const styles: Record<OrderStatus, string> = {
  draft:     "bg-muted text-muted-foreground",
  pending:   "bg-hivis/30 text-hivis-foreground border border-hivis/50",
  approved:  "bg-success/15 text-[oklch(0.42_0.13_155)] border border-success/30",
  ordered:   "bg-primary/10 text-primary border border-primary/20",
  delivered: "bg-success/20 text-[oklch(0.38_0.13_155)] border border-success/40",
  rejected:  "bg-destructive/10 text-destructive border border-destructive/30",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={["inline-flex items-center gap-1.5 text-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded", styles[status]].join(" ")}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {statusLabel(status)}
    </span>
  );
}
