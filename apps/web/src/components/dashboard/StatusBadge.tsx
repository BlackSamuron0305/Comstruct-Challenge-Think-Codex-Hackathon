type OrderStatus = string;

const styles: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-hivis/30 text-hivis-foreground border border-hivis/50",
  pending_approval: "bg-hivis/30 text-hivis-foreground border border-hivis/50",
  approved: "bg-success/15 text-[oklch(0.42_0.13_155)] border border-success/30",
  ordered: "bg-primary/10 text-primary border border-primary/20",
  in_transit: "bg-primary/10 text-primary border border-primary/20",
  delivered: "bg-success/20 text-[oklch(0.38_0.13_155)] border border-success/40",
  rejected: "bg-destructive/10 text-destructive border border-destructive/30",
};

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const style = styles[status] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 text-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded",
        style,
      ].join(" ")}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {statusLabel(status)}
    </span>
  );
}
