export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Quintic ease-out. */
export const eOut = (u: number) => 1 - Math.pow(1 - clamp(u), 5);
/** Cubic ease-in-out. */
export const eIO = (u: number) => {
  u = clamp(u);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
};
