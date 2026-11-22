export type Role = 'Manager' | 'Service Advisor' | 'Parts Staff' | 'Accountant';

export type ModuleId =
  | 'dashboard'
  | 'inventory'
  | 'repair-orders'
  | 'customers'
  | 'sales'
  | 'invoices'
  | 'reports'
  | 'users'
  | 'settings';

/** none = hidden and blocked, view = read-only, full = read and write */
export type Access = 'none' | 'view' | 'full';

export const ROLES: Role[] = ['Manager', 'Service Advisor', 'Parts Staff', 'Accountant'];

export const MODULE_LABELS: Record<ModuleId, string> = {
  dashboard: 'Dashboard',
  inventory: 'Parts Inventory',
  'repair-orders': 'Repair Orders',
  customers: 'Customers',
  sales: 'Sales',
  invoices: 'Invoices',
  reports: 'Reports & Analytics',
  users: 'Users & Roles',
  settings: 'Settings',
};

export const MODULE_ORDER: ModuleId[] = [
  'dashboard',
  'inventory',
  'repair-orders',
  'customers',
  'sales',
  'invoices',
  'reports',
  'users',
  'settings',
];

export type PermissionMatrix = Record<Role, Record<ModuleId, Access>>;

/**
 * Default role permission matrix. The live matrix is in the database
 * (public.role_permissions, seeded with these same values by
 * supabase/migrations/002, customers added by 006) and is loaded by AuthContext; this is the
 * fallback when it cannot be read. RLS enforces the database copy.
 */
export const ACCESS: PermissionMatrix = {
  Manager: {
    dashboard: 'full',
    inventory: 'full',
    'repair-orders': 'full',
    customers: 'full',
    sales: 'full',
    invoices: 'full',
    reports: 'full',
    users: 'full',
    settings: 'full',
  },
  'Service Advisor': {
    dashboard: 'view',
    inventory: 'none',
    'repair-orders': 'full',
    customers: 'full',
    sales: 'view',
    invoices: 'full',
    reports: 'none',
    users: 'none',
    settings: 'none',
  },
  'Parts Staff': {
    dashboard: 'view',
    inventory: 'full',
    'repair-orders': 'view',
    customers: 'view',
    sales: 'view',
    invoices: 'none',
    reports: 'none',
    users: 'none',
    settings: 'none',
  },
  Accountant: {
    dashboard: 'view',
    inventory: 'view',
    'repair-orders': 'view',
    customers: 'view',
    sales: 'full',
    invoices: 'full',
    reports: 'full',
    users: 'none',
    settings: 'none',
  },
};
