import { type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bot,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  LogOut,
  Receipt,
  Settings,
} from 'lucide-react';
import { useAuthStore } from '../store/auth';

const NAV: Array<{ to: string; label: string; icon: ReactNode; roles?: string[] }> = [
  { to: '/dashboard', label: 'Dashboard', icon: <BarChart3 size={18} /> },
  {
    to: '/approvals',
    label: 'Approvals',
    icon: <CheckCircle2 size={18} />,
    roles: ['project_manager', 'procurement_admin'],
  },
  { to: '/orders', label: 'Orders', icon: <Receipt size={18} /> },
  { to: '/ingest', label: 'Catalog', icon: <ClipboardList size={18} /> },
  {
    to: '/contracts',
    label: 'Contracts',
    icon: <FileText size={18} />,
    roles: ['procurement_admin', 'project_manager'],
  },
  {
    to: '/scoring',
    label: 'Supplier Scoring',
    icon: <FileSpreadsheet size={18} />,
    roles: ['procurement_admin', 'project_manager'],
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: <Settings size={18} />,
    roles: ['procurement_admin', 'project_manager'],
  },
  { to: '/ai', label: 'AI Assistant', icon: <Bot size={18} /> },
];

export function AppShell(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const nav = useNavigate();

  if (!user) {
    nav('/login');
    return <div />;
  }

  const allowed = NAV.filter((n) => !n.roles || n.roles.includes(user.role));

  return (
    <div className="min-h-screen bg-brand-surface lg:flex">
      <aside className="w-full border-b border-brand-line/40 bg-brand-sidebar lg:min-h-screen lg:w-60 lg:shrink-0 lg:border-b-0">
        <div className="border-b border-brand-line/40 px-5 py-6">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-brand-surface">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="2" width="6" height="6" rx="1.5" fill="currentColor" />
                <rect x="10" y="2" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.6" />
                <rect x="2" y="10" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.6" />
                <rect x="10" y="10" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.3" />
              </svg>
            </div>
            <div>
              <div className="text-base font-bold text-brand-card">comstruct</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-brand-light/70">
                Procurement
              </div>
            </div>
          </Link>
        </div>

        <nav className="space-y-1 px-3 py-4">
          {allowed.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${
                  isActive
                    ? 'bg-brand text-brand-surface shadow-[0_8px_24px_rgba(45,112,128,0.35)]'
                    : 'text-brand-light hover:bg-brand/15 hover:text-brand'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
                      isActive
                        ? 'bg-brand-accent text-brand-sidebar'
                        : 'bg-brand-sidebar/40 text-brand-light group-hover:bg-brand/20 group-hover:text-brand'
                    }`}
                  >
                    {n.icon}
                  </span>
                  <span className={isActive ? 'font-semibold' : 'font-medium'}>{n.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-brand-line/40 p-4 text-sm text-brand-light">
          <div className="inline-flex rounded-[10px] bg-brand-light/20 px-3 py-2 font-medium text-brand-card">
            {user.full_name}
          </div>
          <div className="mb-3 text-xs uppercase tracking-[0.12em] text-brand-light/80">
            {user.role.replace('_', ' ')}
          </div>
          <button
            onClick={() => {
              logout();
              nav('/login');
            }}
            className="w-full rounded-[12px] border border-brand-light/25 bg-brand/90 px-4 py-3 text-left text-sm font-semibold text-brand-surface hover:bg-brand/80"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-5 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
