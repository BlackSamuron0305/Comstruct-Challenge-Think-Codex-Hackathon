import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from './layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { OrdersPage } from './pages/OrdersPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { IngestPage } from './pages/IngestPage';
import { SupplierScoringPage } from './pages/SupplierScoringPage';
import { AIAssistantPage } from './pages/AIAssistantPage';
import { ContractsPage } from './pages/ContractsPage';
import { useAuthStore } from './store/auth';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

function Guarded({ children }: { children: JSX.Element }): JSX.Element {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function HomeRedirect(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to="/dashboard" replace />;
}

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<Guarded><AppShell /></Guarded>}>
            <Route index element={<HomeRedirect />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="ingest" element={<IngestPage />} />
            <Route path="contracts" element={<ContractsPage />} />
            <Route path="scoring" element={<SupplierScoringPage />} />
            <Route path="ai" element={<AIAssistantPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
