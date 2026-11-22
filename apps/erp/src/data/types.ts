import type { Role } from '@/auth/rbac';

export type RepairStatus = 'Pending' | 'In Progress' | 'Quality Check' | 'Completed';
export type InvoiceStatus = 'Pending' | 'Paid' | 'Overdue';
export type StockStatus = 'ok' | 'low' | 'out';

export interface Part {
  id: string;
  name: string;
  sku: string;
  category: string;
  stock: number;
  minStock: number;
  unitCost: number;
}

export interface RepairOrder {
  id: string;
  customer: string;
  vehicle: string;
  service: string;
  technician: string;
  status: RepairStatus;
  total: number;
  date: string;
}

export interface Invoice {
  id: string;
  customer: string;
  vehicle: string;
  amount: number;
  issued: string;
  due: string;
  status: InvoiceStatus;
}

export interface Sale {
  id: string;
  kind: 'Parts' | 'Service';
  customer: string;
  items: string;
  total: number;
  when: string;
  payment: 'Card' | 'Invoice' | 'Cash';
}

export interface TeamMember {
  id: number;
  name: string;
  email: string;
  role: Role;
  department: string;
  since: string;
}

export interface RevenuePoint {
  month: string;
  revenue: number;
  target: number;
}

export interface MixSlice {
  name: string;
  value: number;
}

export interface TopPart {
  name: string;
  sold: number;
}

export interface TechnicianStat {
  name: string;
  orders: number;
  avgRepairTime: string;
  revenue: number;
  rating: number;
}
