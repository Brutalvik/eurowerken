import type { Role } from '@/auth/rbac';
import type { InvoiceStatus, Part, RepairStatus, StockStatus } from '@/data/types';
import type { Tone } from '@/components/ui/Badge';

export function stockStatus(part: Pick<Part, 'stock' | 'minStock'>): StockStatus {
  if (part.stock === 0) return 'out';
  if (part.stock < part.minStock) return 'low';
  return 'ok';
}

export const STOCK_LABEL: Record<StockStatus, string> = {
  ok: 'In stock',
  low: 'Low stock',
  out: 'Out of stock',
};

export const STOCK_TONE: Record<StockStatus, Tone> = {
  ok: 'ok',
  low: 'warn',
  out: 'bad',
};

export const REPAIR_TONE: Record<RepairStatus, Tone> = {
  Pending: 'warn',
  'In Progress': 'info',
  'Quality Check': 'violet',
  Completed: 'ok',
};

export const INVOICE_TONE: Record<InvoiceStatus, Tone> = {
  Pending: 'warn',
  Paid: 'ok',
  Overdue: 'bad',
};

export const ROLE_TONE: Record<Role, Tone> = {
  Manager: 'violet',
  'Service Advisor': 'info',
  'Parts Staff': 'warn',
  Accountant: 'bad',
};
