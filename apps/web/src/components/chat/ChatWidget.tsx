import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, X, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type OrderSummary, type ProjectRecord, type SupplierRecord } from "@/lib/api";
import { answerQuestion } from "./answerEngine";

type Msg = { role: "user" | "assistant"; content: string };
type ChatApiResponse = {
  reply?: string;
  suggestions?: string[];
};

const SUGGESTIONS = [
  "What needs approval?",
  "Current spend summary",
  "Top suppliers",
  "Which project is busiest?",
];

function renderMarkdown(text: string) {
  // Tiny markdown: **bold**, `code`, lists, paragraphs, --- separators
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (list.length) {
      out.push(
        <ul key={`ul-${out.length}`} className="list-disc pl-5 space-y-0.5 my-1">
          {list.map((l, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: inline(l) }} />
          ))}
        </ul>,
      );
      list = [];
    }
  };

  function inline(s: string) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(
        /`([^`]+)`/g,
        '<code class="text-mono text-[11px] px-1 py-0.5 rounded bg-muted">$1</code>',
      )
      .replace(/\*(.+?)\*/g, "<em>$1</em>");
  }

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      list.push(trimmed.slice(2));
    } else if (trimmed === "---") {
      flushList();
      out.push(<hr key={`hr-${i}`} className="my-2 border-border" />);
    } else if (trimmed === "") {
      flushList();
    } else {
      flushList();
      out.push(
        <p key={`p-${i}`} className="my-1" dangerouslySetInnerHTML={{ __html: inline(trimmed) }} />,
      );
    }
  });
  flushList();
  return out;
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi 👋 I'm your procurement assistant. Ask me about approvals, spend, suppliers, or materials and I will use the live AI service to help.",
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: orders = [] } = useQuery({
    queryKey: ["assistant", "orders"],
    queryFn: () => api.get<OrderSummary[]>("/api/orders", { params: { limit: 200 } }),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["assistant", "suppliers"],
    queryFn: () => api.get<SupplierRecord[]>("/api/suppliers"),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["assistant", "projects"],
    queryFn: () => api.get<ProjectRecord[]>("/api/projects"),
  });

  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const assistantContext = useMemo(
    () => ({
      pending_approval_count: orders.filter((order) => order.status === "pending_approval").length,
      supplier_count: suppliers.length,
      project_names: projects.slice(0, 12).map((project) => project.name),
      recent_orders: orders.slice(0, 8).map((order) => ({
        id: order.id,
        project: order.project_id ? (projectMap.get(order.project_id) ?? order.project_id) : null,
        supplier: order.supplier_name ?? null,
        total_amount: order.total_amount,
        currency: order.currency,
        status: order.status,
        requires_approval: order.requires_approval ?? false,
      })),
    }),
    [orders, suppliers, projects, projectMap],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;

    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setBusy(true);

    try {
      const language =
        typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("de")
          ? "de"
          : "en";
      const response = await api.post<ChatApiResponse>("/api/ai/chat", {
        message: q,
        language,
        context: assistantContext,
      });
      const reply = response.reply?.trim() || answerQuestion(q, { orders, suppliers, projectMap });
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      const fallback = answerQuestion(q, { orders, suppliers, projectMap });
      setMessages((m) => [...m, { role: "assistant", content: fallback }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-hivis text-hivis-foreground shadow-lg hover:scale-105 transition grid place-items-center"
          aria-label="Open assistant"
        >
          <MessageSquare className="h-6 w-6" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-3rem)] rounded-xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/40">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-hivis grid place-items-center">
                <Sparkles className="h-4 w-4 text-hivis-foreground" />
              </div>
              <div>
                <div className="text-sm font-semibold leading-tight">Procurement assistant</div>
                <div className="text-[10px] text-mono uppercase tracking-widest text-muted-foreground">
                  Live AI assistant
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] bg-primary text-primary-foreground rounded-lg px-3 py-2"
                    : "mr-auto max-w-[90%] bg-secondary text-foreground rounded-lg px-3 py-2"
                }
              >
                {m.role === "assistant" ? (
                  <div className="prose-sm">{renderMarkdown(m.content)}</div>
                ) : (
                  m.content
                )}
              </div>
            ))}
            {busy && (
              <div className="mr-auto max-w-[90%] rounded-lg bg-secondary px-3 py-2 text-foreground">
                Thinking…
              </div>
            )}
          </div>

          {messages.length <= 2 && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={busy}
                  className="text-[11px] px-2 py-1 rounded-full border border-border bg-card hover:bg-accent disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="p-3 border-t border-border flex items-center gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the procurement AI…"
              className="flex-1"
              disabled={busy}
            />
            <Button
              type="submit"
              size="icon"
              className="bg-hivis text-hivis-foreground hover:bg-hivis/90"
              disabled={busy}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
