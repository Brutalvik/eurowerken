import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAccess } from '@/auth/RequireAccess';
import { RequireAuth } from '@/auth/RequireAuth';
import type { ModuleId } from '@/auth/rbac';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { InvitePage } from '@/pages/auth/InvitePage';
import { OnboardingPage } from '@/pages/auth/OnboardingPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { SetupRequiredPage } from '@/pages/auth/SetupRequiredPage';
import { LegalPage } from '@/pages/legal/LegalPage';
import { PRIVACY, TERMS } from '@eurowerken/shared';
import { supabaseConfigured } from '@/lib/supabase';
import { lazy } from 'react';
import type { ReactNode } from 'react';

// Pages inside the app layout load on demand; AppLayout wraps them in a PageBoundary
// (spinner while loading, a friendly message if one fails).
const AppointmentsPage = lazy(() => import('@/pages/AppointmentsPage').then((m) => ({ default: m.AppointmentsPage })));
const CustomersPage = lazy(() => import('@/pages/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const InventoryPage = lazy(() => import('@/pages/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const InvoicesPage = lazy(() => import('@/pages/InvoicesPage').then((m) => ({ default: m.InvoicesPage })));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const RepairOrdersPage = lazy(() => import('@/pages/RepairOrdersPage').then((m) => ({ default: m.RepairOrdersPage })));
const SalesPage = lazy(() => import('@/pages/SalesPage').then((m) => ({ default: m.SalesPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const UsersPage = lazy(() => import('@/pages/UsersPage').then((m) => ({ default: m.UsersPage })));

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
        {/* Not a module of its own: Appointments follows repair-orders access (src/config/nav.ts). */}
        <Route path="appointments" element={guarded('repair-orders', <AppointmentsPage />)} />
        <Route path="inventory" element={guarded('inventory', <InventoryPage />)} />
        <Route path="repair-orders" element={guarded('repair-orders', <RepairOrdersPage />)} />
        <Route path="customers" element={guarded('customers', <CustomersPage />)} />
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
