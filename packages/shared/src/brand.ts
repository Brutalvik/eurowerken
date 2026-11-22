/** "#1d6ff0" to "29 111 240" for the rgb(var(--accent) / alpha) tokens. Null when not a valid hex colour. */
export function hexToRgbTriplet(hex: string | null | undefined): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Text colour triplet (white or near-black) that reads best on the given colour triplet. */
export function readableOn(triplet: string): string {
  const [r, g, b] = triplet.split(' ').map((v) => Number(v) / 255) as [number, number, number];
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // Contrast against white vs against near-black (10 22 40).
  return (1.05 / (luminance + 0.05)) >= ((luminance + 0.05) / 0.0127) ? '255 255 255' : '10 22 40';
}

/** Relative luminance (WCAG) of a colour triplet "r g b", 0 to 1. */
export function luminance(triplet: string): number {
  const [r, g, b] = triplet.split(' ').map((v) => Number(v) / 255) as [number, number, number];
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * The brand colour for dark backgrounds: brightened (towards white) just enough to read on near-black, at least
 * 30% brighter, keeping the hue. Very dark brand colours get lifted further.
 */
export function brightenForDark(triplet: string): string {
  for (let amount = 0.3; amount < 0.95; amount += 0.05) {
    const t = lightenTriplet(triplet, amount);
    // Contrast against a near-black background (luminance about 0.01) of at least 6:1.
    if ((luminance(t) + 0.05) / 0.06 >= 6) return t;
  }
  return lightenTriplet(triplet, 0.95);
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
