import { Bell } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { api, formatCurrency, type OrderSummary } from "@/lib/api";

function normalizeStatus(status?: string | null) {
  return (status ?? "").toLowerCase().replace(/[\s-]+/g, "_");
}

function relativeTimeLabel(value?: string) {
  if (!value) return "just now";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "just now";

  const diffMinutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return `${Math.round(diffHours / 24)}d ago`;
}

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { data: orders = [] } = useQuery({
    queryKey: ["topbar", "notifications"],
    queryFn: () => api.get<OrderSummary[]>("/api/orders", { params: { limit: 50 } }),
    staleTime: 30_000,
  });

  const notifications = useMemo(() => {
    const sorted = [...orders].sort((a, b) => {
      const left = new Date(b.updated_at ?? b.created_at).getTime();
      const right = new Date(a.updated_at ?? a.created_at).getTime();
      return left - right;
    });

    return sorted.slice(0, 4).map((order) => {
      const status = normalizeStatus(order.status);
      const firstItem = order.items?.[0]?.product_snapshot?.name;
      const statusLabel =
        status === "pending" || status === "pending_approval"
          ? "Approval required"
          : status === "delivered"
            ? "Delivered"
            : status === "rejected"
              ? "Rejected"
              : "Order update";

      return {
        id: order.id,
        title: statusLabel,
        detail: `${firstItem ?? order.supplier_name ?? "Order"} · ${formatCurrency(Number(order.total_amount ?? 0), order.currency ?? "EUR")}`,
        time: relativeTimeLabel(order.updated_at ?? order.created_at),
        urgent: status === "pending" || status === "pending_approval" || status === "rejected",
      };
    });
  }, [orders]);

  const unreadCount = notifications.filter((item) => item.urgent).length;

  return (
    <header className="h-20 border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30">
      <div className="h-full px-4 lg:px-8 flex items-center gap-4">
        <div className="min-w-0">
          <h1 className="text-display text-xl font-semibold leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotificationsOpen((open) => !open)}
              className="relative h-9 w-9 grid place-items-center rounded-md border border-border bg-card hover:bg-accent"
              aria-label="Open notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 min-w-4 h-4 rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {Math.min(unreadCount, 9)}
                </span>
              ) : null}
            </button>

            {notificationsOpen ? (
              <div className="absolute right-0 top-11 z-50 w-80 rounded-lg border border-border bg-card shadow-lg">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <div>
                    <div className="text-sm font-semibold">Notifications</div>
                    <div className="text-[11px] text-muted-foreground">
                      Order and approval updates
                    </div>
                  </div>
                  <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {notifications.length}
                  </span>
                </div>

                <div className="max-h-80 overflow-y-auto p-2">
                  {notifications.length === 0 ? (
                    <div className="rounded-md px-3 py-6 text-center text-sm text-muted-foreground">
                      No notifications right now.
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className="rounded-md px-3 py-2 hover:bg-accent/60"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium">{notification.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {notification.detail}
                            </div>
                          </div>
                          <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                            {notification.time}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
