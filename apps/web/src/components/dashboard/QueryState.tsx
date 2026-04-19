import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";

type QueryStateProps = {
  kind: "loading" | "error";
  title: string;
  description: string;
  onRetry?: () => void;
  tip?: string;
  retryLabel?: string;
};

export function QueryState({ kind, title, description, onRetry, tip, retryLabel }: QueryStateProps) {
  const isLoading = kind === "loading";
  const helperText = tip ?? (isLoading
    ? "This screen reconnects automatically as soon as the live service responds."
    : "Retrying keeps your current workspace state and filters.");

  return (
    <div className="rounded-lg border border-border bg-card p-8 text-sm">
      <div className="flex items-start gap-3">
        <div className={[
          "mt-0.5 flex h-9 w-9 items-center justify-center rounded-md",
          isLoading ? "bg-secondary text-foreground" : "bg-warning/30 text-warning-foreground",
        ].join(" ")}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
        </div>
        <div className="flex-1">
          <div className="font-medium">{title}</div>
          <p className="mt-1 text-muted-foreground">{description}</p>
          <div className="mt-3 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            {helperText}
          </div>
          {!isLoading && onRetry ? (
            <button onClick={onRetry} className="mt-3 inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">
              {retryLabel ?? "Retry now"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
