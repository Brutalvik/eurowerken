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

// Appointments (src/api/appointments.ts) -----------------------------------------

type AppointmentStatus = 'requested' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  requested: 'Requested',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

export const APPOINTMENT_TONE: Record<AppointmentStatus, Tone> = {
  requested: 'warn',
  confirmed: 'info',
  checked_in: 'violet',
  completed: 'ok',
  cancelled: 'neutral',
  no_show: 'bad',
};

/** Calendar block colours per status (written out so Tailwind finds them). */
export const APPOINTMENT_BLOCK: Record<AppointmentStatus, string> = {
  requested: 'border-warn bg-warn/15 hover:bg-warn/25',
  confirmed: 'border-accent bg-accent/15 hover:bg-accent/25',
  checked_in: 'border-violet bg-violet/15 hover:bg-violet/25',
  completed: 'border-ok bg-ok/15 hover:bg-ok/25',
  cancelled: 'border-fg3 bg-fg3/10 text-fg3 line-through hover:bg-fg3/20',
  no_show: 'border-bad bg-bad/10 hover:bg-bad/20',
};
