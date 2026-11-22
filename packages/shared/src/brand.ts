/** "#1d6ff0" to "29 111 240" for the rgb(var(--accent) / alpha) tokens. Null when not a valid hex colour. */
export function hexToRgbTriplet(hex: string | null | undefined): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Brighter version of a colour for dark backgrounds, so the accent stays readable. */
export function lightenTriplet(triplet: string, amount = 0.25): string {
  return triplet
    .split(' ')
    .map((v) => Math.round(Number(v) + (255 - Number(v)) * amount))
    .join(' ');
}

/**
 * Two-tone wordmark: "EuroWerks" becomes ["Euro", "Werks"], "Bravo Motors"
 * becomes ["Bravo ", "Motors"]. A single plain word stays whole.
 */
export function splitBrandName(name: string): [string, string] {
  const trimmed = name.trim();
  const space = trimmed.lastIndexOf(' ');
  if (space > 0) return [trimmed.slice(0, space + 1), trimmed.slice(space + 1)];
  const camel = /^(.+?)([A-Z][a-z0-9]+)$/.exec(trimmed);
  if (camel && camel[1]!.length > 1) return [camel[1]!, camel[2]!];
  return [trimmed, ''];
}

/** Lowercase URL name from a workshop name: "Bravo Motors" to "bravo-motors". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
