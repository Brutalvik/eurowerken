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
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { InvitePage } from '@/pages/auth/InvitePage';
import { OnboardingPage } from '@/pages/auth/OnboardingPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { SetupRequiredPage } from '@/pages/auth/SetupRequiredPage';
import { LegalPage } from '@/pages/legal/LegalPage';
import { PRIVACY, TERMS } from '@eurowerken/shared';
import { supabaseConfigured } from '@/lib/supabase';
import type { ReactNode } from 'react';

function guarded(module: ModuleId, page: ReactNode) {
  return <RequireAccess module={module}>{page}</RequireAccess>;
}

export default function App() {
  // Legal pages are public and work even before Supabase is configured.
  const legal = [
    <Route key="terms" path="terms" element={<LegalPage doc={TERMS} />} />,
    <Route key="privacy" path="privacy" element={<LegalPage doc={PRIVACY} />} />,
  ];

  if (!supabaseConfigured) {
    return (
      <Routes>
        {legal}
        <Route path="*" element={<SetupRequiredPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {legal}
      <Route path="login" element={<LoginPage />} />
      <Route path="register" element={<RegisterPage />} />
      <Route path="reset-password" element={<ResetPasswordPage />} />
      <Route path="invite/:token" element={<InvitePage />} />
      <Route
        path="onboarding"
        element={
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        }
      />
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
