import { type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileText,
  FolderKanban,
  LogOut,
  Search,
  Receipt,
} from 'lucide-react';
import { useProjectContext } from '../context/ProjectContext';
import { useAuthStore } from '../store/auth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

const NAV: Array<{ to: string; label: string; icon: ReactNode; roles?: string[] }> = [
  { to: '/dashboard', label: 'Dashboard', icon: <BarChart3 size={18} /> },
  {
    to: '/approvals',
    label: 'Approvals',
    icon: <CheckCircle2 size={18} />,
    roles: ['project_manager', 'procurement_admin'],
  },
  { to: '/orders', label: 'Orders', icon: <Receipt size={18} /> },
  {
    to: '/policies',
    label: 'Policies',
    icon: <FolderKanban size={18} />,
    roles: ['project_manager', 'procurement_admin'],
  },
  { to: '/ingest', label: 'Catalog', icon: <ClipboardList size={18} /> },
  {
    to: '/contracts',
    label: 'Contracts',
    icon: <FileText size={18} />,
    roles: ['procurement_admin', 'project_manager'],
  },
];

export function AppShell(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const nav = useNavigate();
  const { projects, selectedProject, selectedProjectId, setSelectedProjectId } = useProjectContext();

  if (!user) {
    nav('/login');
    return <div />;
  }

  const allowed = NAV.filter((n) => !n.roles || n.roles.includes(user.role));

  return (
    <div className="min-h-screen bg-brand-surface lg:flex">
      <aside className="w-full border-b border-brand-line/40 bg-brand-sidebar lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:self-start lg:flex-col lg:border-b-0">
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
            </div>
          </Link>
        </div>

        <div className="border-b border-brand-line/40 px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-light/75">
            Project context
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="mt-3 flex w-full items-center justify-between rounded-2xl border border-brand-line/30 bg-white/5 px-3 py-3 text-left text-brand-light transition hover:border-brand-light/30 hover:bg-brand/15"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{selectedProject.name}</div>
                  <div className="mt-1 truncate text-xs text-brand-light/75">{selectedProject.trade}</div>
                </div>
                <div className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/20 text-brand-light">
                  <ChevronDown size={16} />
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[15rem] border-brand-line"
              style={{ backgroundColor: 'var(--brand-sidebar)' }}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-brand-light/75">Projects</DropdownMenuLabel>
                {projects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onSelect={() => setSelectedProjectId(project.id)}
                    className="items-start gap-3 rounded-[16px] px-3 py-3 text-brand-light focus:bg-brand/20 focus:text-brand-surface"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{project.name}</div>
                      <div className="mt-1 truncate text-xs text-brand-light/75">{project.trade}</div>
                    </div>
                    <DropdownMenuShortcut className="text-brand-light/60">
                      {project.id === selectedProjectId ? 'Active' : ''}
                    </DropdownMenuShortcut>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
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
        <div className="mb-6 flex flex-col gap-4 rounded-[20px] border border-brand-line bg-white/70 px-4 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div className="relative w-full max-w-xl">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              aria-label="Global search"
              placeholder="Search requests, suppliers, contracts or SKUs"
              className="w-full rounded-full border border-brand-line bg-white py-3 pl-10 pr-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </div>
          <div className="min-w-0 rounded-[18px] bg-brand-surface px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Active project
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-slate-900">{selectedProject.name}</div>
            <div className="truncate text-xs text-slate-500">
              {selectedProject.trade} · {selectedProject.site_address}
            </div>
          </div>
        </div>

        <Outlet />
      </main>
    </div>
  );
}
