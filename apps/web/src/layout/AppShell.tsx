import { type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ClipboardList, ShoppingCart, Upload, BarChart3, Bot, LogOut } from 'lucide-react';
import { useAuthStore } from '../store/auth';

const NAV: Array<{ to: string; label: string; icon: ReactNode; roles?: string[] }> = [
  { to: '/orders', label: 'Orders', icon: <ClipboardList size={18} /> },
  { to: '/approvals', label: 'Approvals', icon: <ShoppingCart size={18} />, roles: ['project_manager', 'procurement_admin'] },
  { to: '/ingest', label: 'Ingest', icon: <Upload size={18} />, roles: ['procurement_admin'] },
  { to: '/scoring', label: 'Supplier Scoring', icon: <BarChart3 size={18} />, roles: ['procurement_admin', 'project_manager'] },
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
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 border-r border-brand-line bg-white flex flex-col">
        <Link to="/orders" className="px-5 py-4 border-b border-brand-line">
          <div className="text-xl font-bold text-brand">comstruct</div>
          <div className="text-xs text-slate-500">C-Materials Console</div>
        </Link>
        <nav className="flex-1 p-3 space-y-1">
          {allowed.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${isActive ? 'bg-brand text-white' : 'text-slate-700 hover:bg-brand-line'
                }`
              }
            >
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-brand-line text-sm">
          <div className="font-medium">{user.full_name}</div>
          <div className="text-xs text-slate-500 mb-2">{user.role}</div>
          <button onClick={() => { logout(); nav('/login'); }}
            className="btn-ghost w-full justify-start text-xs">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
