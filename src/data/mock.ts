import type {
  Invoice,
  MixSlice,
  Part,
  RepairOrder,
  RevenuePoint,
  Sale,
  TeamMember,
  TechnicianStat,
  TopPart,
} from './types';

/**
 * Static mock data. Each export maps to a future API resource; replace these
 * with calls in src/api/ once the shared backend exists.
 */

export const parts: Part[] = [
  { id: 'P-0041', name: 'Zimmermann Brake Rotor (Front)', sku: 'ZIM-FR-M3', category: 'Brakes', stock: 3, minStock: 5, unitCost: 89.99 },
  { id: 'P-0042', name: 'Brembo Ceramic Brake Pads', sku: 'BRE-PAD-M3', category: 'Brakes', stock: 12, minStock: 8, unitCost: 124.99 },
  { id: 'P-0043', name: 'Mann Oil Filter HU 816 x', sku: 'MANN-HU816', category: 'Filters', stock: 0, minStock: 10, unitCost: 18.5 },
  { id: 'P-0044', name: 'Bilstein B6 Shock Absorber', sku: 'BIL-B6-R', category: 'Suspension', stock: 6, minStock: 4, unitCost: 185 },
  { id: 'P-0045', name: 'NGK Laser Iridium Plugs (Set of 6)', sku: 'NGK-LAS-I6', category: 'Ignition', stock: 14, minStock: 6, unitCost: 89.99 },
  { id: 'P-0046', name: 'Liqui Moly 5W-40 (5L)', sku: 'LM-5W40-5L', category: 'Fluids', stock: 2, minStock: 15, unitCost: 45.99 },
  { id: 'P-0047', name: 'Bosch Fuel Injector Set', sku: 'BSC-INJ-S6', category: 'Engine', stock: 4, minStock: 3, unitCost: 290 },
  { id: 'P-0048', name: 'Gates Timing Belt Kit', sku: 'GAT-TBK-V8', category: 'Engine', stock: 7, minStock: 3, unitCost: 145 },
];

export const repairOrders: RepairOrder[] = [
  { id: 'RO-8441', customer: 'James Hartley', vehicle: '2022 BMW M3 G80', service: 'Brake service and diagnostic', technician: 'Klaus M.', status: 'In Progress', total: 985, date: 'Apr 22' },
  { id: 'RO-8440', customer: 'Sarah Chen', vehicle: '2019 Porsche 911', service: 'Scheduled maintenance', technician: 'Dieter F.', status: 'Completed', total: 620, date: 'Apr 22' },
  { id: 'RO-8439', customer: 'Marcus Webb', vehicle: '2020 Mercedes C63', service: 'Performance tuning', technician: 'Alex R.', status: 'Pending', total: 1400, date: 'Apr 21' },
  { id: 'RO-8438', customer: 'Priya Nair', vehicle: '2021 Audi RS6 Avant', service: 'Suspension overhaul', technician: 'Klaus M.', status: 'Completed', total: 2100, date: 'Apr 20' },
  { id: 'RO-8437', customer: 'David Reeves', vehicle: '2019 Audi Q7', service: 'Transmission service', technician: 'Dieter F.', status: 'Quality Check', total: 890, date: 'Apr 20' },
];

export const invoices: Invoice[] = [
  { id: 'INV-2241', customer: 'James Hartley', vehicle: '2022 BMW M3', amount: 985, issued: 'Apr 22', due: 'May 7', status: 'Pending' },
  { id: 'INV-2240', customer: 'Sarah Chen', vehicle: '2019 Porsche 911', amount: 620, issued: 'Apr 22', due: 'May 7', status: 'Paid' },
  { id: 'INV-2239', customer: 'Michael Torres', vehicle: '2018 BMW 5 Series', amount: 340, issued: 'Apr 18', due: 'May 3', status: 'Overdue' },
  { id: 'INV-2238', customer: 'Priya Nair', vehicle: '2021 Audi RS6', amount: 2100, issued: 'Apr 20', due: 'May 5', status: 'Paid' },
  { id: 'INV-2237', customer: 'Lars Svensson', vehicle: '2020 Volvo XC90', amount: 780, issued: 'Apr 16', due: 'May 1', status: 'Overdue' },
  { id: 'INV-2236', customer: 'Emma Wilson', vehicle: '2023 Mini Cooper S', amount: 195, issued: 'Apr 14', due: 'Apr 29', status: 'Paid' },
];

export const sales: Sale[] = [
  { id: 'S-1041', kind: 'Parts', customer: 'Walk-in', items: 'NGK spark plugs x1', total: 89.99, when: 'Today 10:24 AM', payment: 'Card' },
  { id: 'S-1040', kind: 'Service', customer: 'Sarah Chen', items: 'Oil service and filter', total: 185, when: 'Today 9:15 AM', payment: 'Invoice' },
  { id: 'S-1039', kind: 'Parts', customer: 'Marcus Webb', items: 'Brake pads x2', total: 249.98, when: 'Yesterday', payment: 'Card' },
  { id: 'S-1038', kind: 'Service', customer: 'Priya Nair', items: 'Alignment and balancing', total: 320, when: 'Yesterday', payment: 'Invoice' },
];

export const teamMembers: TeamMember[] = [
  { id: 1, name: 'Marcus Weber', email: 'marcus@eurowerken.com', role: 'Manager', department: 'Management', since: 'Jan 2019' },
  { id: 2, name: 'Klaus Mueller', email: 'k.mueller@eurowerken.com', role: 'Service Advisor', department: 'Workshop', since: 'Mar 2020' },
  { id: 3, name: 'Dieter Fischer', email: 'd.fischer@eurowerken.com', role: 'Service Advisor', department: 'Workshop', since: 'Jun 2020' },
  { id: 4, name: 'Sarah Jenkins', email: 's.jenkins@eurowerken.com', role: 'Service Advisor', department: 'Customer Service', since: 'Feb 2021' },
  { id: 5, name: 'Ryan Park', email: 'r.park@eurowerken.com', role: 'Parts Staff', department: 'Parts', since: 'Sep 2021' },
  { id: 6, name: 'Lisa Hoffman', email: 'l.hoffman@eurowerken.com', role: 'Accountant', department: 'Finance', since: 'Nov 2022' },
];

export const revenueSeries: RevenuePoint[] = [
  { month: 'Nov', revenue: 38400, target: 40000 },
  { month: 'Dec', revenue: 45200, target: 42000 },
  { month: 'Jan', revenue: 41800, target: 43000 },
  { month: 'Feb', revenue: 49600, target: 45000 },
  { month: 'Mar', revenue: 52300, target: 47000 },
  { month: 'Apr', revenue: 58100, target: 50000 },
];

export const serviceMix: MixSlice[] = [
  { name: 'Maintenance', value: 42 },
  { name: 'Repairs', value: 28 },
  { name: 'Parts', value: 18 },
  { name: 'Diagnostics', value: 12 },
];

export const topParts: TopPart[] = [
  { name: 'Oil Filter', sold: 72 },
  { name: 'Brake Pads', sold: 48 },
  { name: 'Air Filter', sold: 35 },
  { name: 'Spark Plugs', sold: 29 },
  { name: 'Rotors', sold: 22 },
];

export const technicianStats: TechnicianStat[] = [
  { name: 'Klaus Mueller', orders: 38, avgRepairTime: '2.4h', revenue: 22840, rating: 4.9 },
  { name: 'Dieter Fischer', orders: 31, avgRepairTime: '2.9h', revenue: 18200, rating: 4.7 },
  { name: 'Alex Richter', orders: 24, avgRepairTime: '3.1h', revenue: 14100, rating: 4.8 },
];
