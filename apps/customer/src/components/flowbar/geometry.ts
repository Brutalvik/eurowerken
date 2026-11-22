/**
 * Stage geometry, in "stage px" from the Flow Tab Bar design (1080 x 1080 artboard). The site only renders the
 * band around the bar: stage x 100 to 980 and y 450 to 710 (room for the bead above and the shadow below).
 */
export const XS = [240, 390, 540, 690, 840];
export const BY = 600;

/** The rendered band of the stage. */
export const VIEW = { x: 100, y: 450, w: 880, h: 260 };

/** Scale from stage px to CSS px: the full width on phones (16 px gutter each side), capped on larger screens. */
export function fitScale(viewportWidth: number): number {
  return Math.min((viewportWidth - 32) / VIEW.w, 0.62);
}
