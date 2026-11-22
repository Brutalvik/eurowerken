export type Role = 'Manager' | 'Service Advisor' | 'Parts Staff' | 'Accountant';

export type ModuleId =
  | 'dashboard'
  | 'inventory'
  | 'repair-orders'
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
  'sales',
  'invoices',
  'reports',
  'users',
  'settings',
];

/**
 * Role permission matrix. This is a UI-side mirror for navigation and
 * button visibility only. The backend must enforce the same rules.
 */
export const ACCESS: Record<Role, Record<ModuleId, Access>> = {
  Manager: {
    dashboard: 'full',
    inventory: 'full',
    'repair-orders': 'full',
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
    sales: 'full',
    invoices: 'full',
    reports: 'full',
    users: 'none',
    settings: 'none',
  },
};
