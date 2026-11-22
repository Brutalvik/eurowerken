import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAccess } from '@/auth/RequireAccess';
import { RequireAuth } from '@/auth/RequireAuth';
import type { ModuleId } from '@/auth/rbac';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { InventoryPage } from '@/pages/InventoryPage';
import { InvoicesPage } from '@/pages/InvoicesPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { RepairOrdersPage } from '@/pages/RepairOrdersPage';
import { SalesPage } from '@/pages/SalesPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { UsersPage } from '@/pages/UsersPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { SetupRequiredPage } from '@/pages/auth/SetupRequiredPage';
import { supabaseConfigured } from '@/lib/supabase';
import type { ReactNode } from 'react';

function guarded(module: ModuleId, page: ReactNode) {
  return <RequireAccess module={module}>{page}</RequireAccess>;
}

export default function App() {
  if (!supabaseConfigured) return <SetupRequiredPage />;

  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route path="reset-password" element={<ResetPasswordPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={guarded('dashboard', <DashboardPage />)} />
        <Route path="inventory" element={guarded('inventory', <InventoryPage />)} />
        <Route path="repair-orders" element={guarded('repair-orders', <RepairOrdersPage />)} />
        <Route path="sales" element={guarded('sales', <SalesPage />)} />
        <Route path="invoices" element={guarded('invoices', <InvoicesPage />)} />
        <Route path="reports" element={guarded('reports', <ReportsPage />)} />
        <Route path="users" element={guarded('users', <UsersPage />)} />
        <Route path="settings" element={guarded('settings', <SettingsPage />)} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
