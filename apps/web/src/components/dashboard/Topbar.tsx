import { Search, Bell, Workflow } from "lucide-react";

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="h-20 border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30">
      <div className="h-full px-4 lg:px-8 flex items-center gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-hivis" />
            <span className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Live
            </span>
          </div>
          <h1 className="text-display text-xl font-semibold leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden xl:flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
            <Workflow className="h-3.5 w-3.5 text-primary" />
            <div className="text-[11px]">
              <span className="text-muted-foreground">AI flow:</span> markdown → extract → review
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-3 h-9 w-72 rounded-md border border-border bg-card">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              placeholder="Search orders, SKUs, suppliers…"
              className="bg-transparent outline-none text-sm flex-1 placeholder:text-muted-foreground"
            />
            <span className="text-mono text-[10px] text-muted-foreground border border-border rounded px-1">
              ⌘K
            </span>
          </div>
          <button className="h-9 w-9 grid place-items-center rounded-md border border-border bg-card hover:bg-accent">
            <Bell className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
