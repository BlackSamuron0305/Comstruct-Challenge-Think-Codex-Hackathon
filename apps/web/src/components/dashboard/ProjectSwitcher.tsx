import { useState, useRef, useEffect } from "react";
import { ChevronsUpDown, Check, Building2 } from "lucide-react";
import { useProject } from "./ProjectContext";

export function ProjectSwitcher() {
  const { project, setProject, options } = useProject();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className="relative px-3 py-3 border-b border-border">
      <div className="text-mono text-[10px] uppercase tracking-widest text-muted-foreground px-1 mb-1.5">
        Project
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md border border-border bg-card hover:bg-accent text-left transition-colors"
      >
        <div className="h-7 w-7 grid place-items-center rounded bg-hivis text-hivis-foreground shrink-0">
          <Building2 className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{project}</div>
          <div className="text-[10px] text-muted-foreground text-mono uppercase tracking-wider">
            {project === "All projects" ? "Aggregate view" : "Filtered view"}
          </div>
        </div>
        <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 z-50 rounded-md border border-border bg-popover shadow-lg overflow-hidden">
          <div className="max-h-72 overflow-auto py-1">
            {options.map((opt) => {
              const active = opt === project;
              return (
                <button
                  key={opt}
                  onClick={() => { setProject(opt); setOpen(false); }}
                  className={[
                    "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent",
                    active ? "bg-accent" : "",
                  ].join(" ")}
                >
                  <Check className={["h-4 w-4 shrink-0", active ? "opacity-100" : "opacity-0"].join(" ")} />
                  <span className="flex-1 truncate">{opt}</span>
                  {opt === "All projects" && (
                    <span className="text-mono text-[9px] uppercase tracking-wider text-muted-foreground">Default</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
