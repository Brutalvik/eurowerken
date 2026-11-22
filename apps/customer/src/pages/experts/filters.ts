import { VEHICLE_MAKES } from '@/data/catalog';
import type { Technician } from '@/data/catalog';

export interface ExpertFilters {
  specialty: string;
  make: string;
  language: string;
  minYears: number;
}

export const EMPTY_FILTERS: ExpertFilters = { specialty: '', make: '', language: '', minYears: 0 };

export const MIN_YEARS_OPTIONS = [
  { value: 0, label: 'Any experience' },
  { value: 5, label: '5+ years' },
  { value: 10, label: '10+ years' },
  { value: 15, label: '15+ years' },
];

/** Marker in the data for someone who works on every make. */
const ALL_MAKES = 'All makes';

/** "Mercedes-AMG", "Mercedes-Benz" -> "mercedes"; "BMW M" -> "bmw"; "Audi e-tron" -> "audi". */
function makeKey(make: string): string {
  return make.split(/[\s-]/)[0]!.toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function specialtyOptions(techs: Technician[]): string[] {
  return unique(techs.flatMap((t) => t.specialties));
}

export function languageOptions(techs: Technician[]): string[] {
  return unique(techs.flatMap((t) => t.languages));
}

/** One option per brand: the catalogue's make names, plus any brand only the technicians list. */
export function makeOptions(techs: Technician[]): string[] {
  const base = Object.keys(VEHICLE_MAKES);
  const known = new Set(base.map(makeKey));
  const extra = techs
    .flatMap((t) => t.makes)
    .filter((m) => m !== ALL_MAKES && !known.has(makeKey(m)))
    .filter((m, i, all) => all.findIndex((x) => makeKey(x) === makeKey(m)) === i);
  return unique([...base, ...extra]);
}

export function matchesFilters(t: Technician, f: ExpertFilters): boolean {
  if (f.specialty && !t.specialties.includes(f.specialty)) return false;
  if (f.language && !t.languages.includes(f.language)) return false;
  if (f.minYears && t.years < f.minYears) return false;
  if (f.make && !t.makes.some((m) => m === ALL_MAKES || makeKey(m) === makeKey(f.make))) return false;
  return true;
}

export function activeFilterCount(f: ExpertFilters): number {
  return [f.specialty, f.make, f.language, f.minYears ? 'y' : ''].filter(Boolean).length;
}
