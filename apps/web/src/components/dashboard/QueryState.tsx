import { AlertCircle, Loader2 } from "lucide-react";

type QueryStateProps = {
  kind: "loading" | "error";
  title: string;
  description: string;
  onRetry?: () => void;
};

export function QueryState({ kind, title, description, onRetry }: QueryStateProps) {
  const isLoading = kind === "loading";

  return (
    <div className="rounded-lg border border-border bg-card p-8 text-sm">
      <div className="flex items-start gap-3">
        <div className={[
          "mt-0.5 flex h-9 w-9 items-center justify-center rounded-md",
          isLoading ? "bg-secondary text-foreground" : "bg-warning/30 text-warning-foreground",
        ].join(" ")}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
        </div>
        <div>
          <div className="font-medium">{title}</div>
          <p className="mt-1 text-muted-foreground">{description}</p>
          {!isLoading && onRetry ? (
            <button onClick={onRetry} className="mt-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
