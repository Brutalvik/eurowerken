/**
 * The shopper's selected vehicle, kept in the URL (?year=&make=&model=) so
 * shop links, part links and shared links all carry it.
 */
export interface Vehicle {
  year: string;
  make: string;
  model: string;
}

export function readVehicle(params: URLSearchParams): Vehicle | null {
  const year = params.get('year') ?? '';
  const make = params.get('make') ?? '';
  const model = params.get('model') ?? '';
  return year && make && model ? { year, make, model } : null;
}

export function vehicleLabel(v: Vehicle): string {
  return `${v.year} ${v.make} ${v.model}`;
}

/** "?year=..&make=..&model=.." for a vehicle, or "" for none. */
export function vehicleQuery(v: Vehicle | null): string {
  if (!v) return '';
  return `?${new URLSearchParams({ year: v.year, make: v.make, model: v.model }).toString()}`;
}
