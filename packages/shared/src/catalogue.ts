/**
 * Row shapes of the catalogue tables (supabase/migrations/005). Both apps use
 * these: the ERP edits them, the customer site reads the published ones.
 */

export const SERVICE_CATEGORY_IDS = ['maintenance', 'diagnostics', 'performance', 'brakes', 'climate', 'electrical'] as const;
export type ServiceCategoryId = (typeof SERVICE_CATEGORY_IDS)[number];

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategoryId, string> = {
  maintenance: 'Maintenance',
  diagnostics: 'Diagnostics',
  performance: 'Performance',
  brakes: 'Brakes & Suspension',
  climate: 'AC & Climate',
  electrical: 'Electrical',
};

export const SERVICE_ICONS = ['oil', 'filter', 'battery', 'scan', 'gauge', 'brake', 'snow', 'bolt', 'wrench'] as const;
export type ServiceIcon = (typeof SERVICE_ICONS)[number];

export interface ServiceRow {
  id: string;
  workshop_id: string;
  category: ServiceCategoryId;
  name: string;
  description: string | null;
  duration_text: string | null;
  price_from: number;
  badge: 'Popular' | 'Recommended' | null;
  icon: ServiceIcon;
  image_path: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TeamMemberRow {
  id: string;
  workshop_id: string;
  profile_id: string | null;
  name: string;
  role_title: string | null;
  bio: string | null;
  specialties: string[];
  makes: string[];
  languages: string[];
  years: number | null;
  certifications: string[];
  photo_path: string | null;
  is_public: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const PART_QUALITIES = ['OEM', 'Genuine', 'Aftermarket'] as const;
export type PartQuality = (typeof PART_QUALITIES)[number];

export interface PartRow {
  id: string;
  workshop_id: string;
  slug: string;
  sku: string | null;
  name: string;
  brand: string | null;
  category: string;
  quality: PartQuality;
  fitment: 'guaranteed' | 'universal';
  part_number: string | null;
  price: number;
  compare_at: number | null;
  stock: number;
  min_stock: number;
  summary: string | null;
  description: string | null;
  features: string[];
  specs: { label: string; value: string }[];
  oem_refs: string[];
  warranty: string | null;
  image_paths: string[];
  published: boolean;
  created_at: string;
  updated_at: string;
}

/** Staff-only unit cost (public.part_costs). */
export interface PartCostRow {
  part_id: string;
  workshop_id: string;
  unit_cost: number;
}

export interface CustomerAccountRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  /** Added in migration 006. */
  notify_email?: boolean;
  notify_sms?: boolean;
  created_at: string;
}

export interface CustomerVehicleRow {
  id: string;
  customer_id: string;
  make: string;
  model: string;
  year: number | null;
  vin: string | null;
  plate: string | null;
  nickname: string | null;
  /** The car's photo in the customer-photos bucket (019). */
  photo_path?: string | null;
  created_at: string;
}

/** Storage bucket for public workshop images; paths start with the workshop id. */
export const PUBLIC_BUCKET = 'workshop-public';

/** Path for a new upload: <workshop>/<area>/<random>.<ext>. */
export function publicImagePath(workshopId: string, area: 'logo' | 'services' | 'team' | 'parts', fileName: string): string {
  const ext = (fileName.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now());
  return `${workshopId}/${area}/${id}.${ext}`;
}

/** Public URL of a file in the workshop-public bucket. */
export function publicImageUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${PUBLIC_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
