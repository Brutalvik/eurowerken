import { XS } from './geometry';
import { clamp, eIO, eOut, lerp } from './math';

/** Each tab's light: violet, cyan, amber, pink, mint (linear RGB, 0 to 1). */
export const ACC: [number, number, number][] = [
  [0.55, 0.4, 1],
  [0.2, 0.75, 1],
  [1, 0.62, 0.2],
  [1, 0.32, 0.6],
  [0.3, 1, 0.7],
];

/** A move of the bead: starts at ts (s), from tab a to tab b, lasting d s. */
export type Move = { ts: number; a: number; b: number; d: number };

/** A move's length for a jump of n tabs: 1 tab 0.24 s, 2 to 3 tabs 0.3 s, 4 tabs 0.34 s (much snappier than the design's demo). */
export const moveLength = (n: number) => (n <= 1 ? 0.24 : n <= 3 ? 0.3 : 0.34);

export type SceneState = {
  x: number;
  rise: number;
  sx: number;
  acc: [number, number, number];
  tap: [number, number];
  sw: number;
  cur: number;
  draw: number;
};

/** A settled bead on tab i (no motion left). */
export const restingOn = (i: number): Move[] => [{ ts: -1000, a: i, b: i, d: 1 }];

/** The state at time t of a list of moves sorted by start: the last move that has started decides it. */
export function state(t: number, moves: Move[]): SceneState {
  let x = XS[0]!,
    rise = 1,
    sx = 1,
    acc = ACC[0]!,
    tap: [number, number] = [0, -1],
    sw = 0,
    cur = 0,
    draw = 1;
  for (const { ts, a, b, d } of moves) {
    if (t < ts) break;
    const u = eIO((t - ts) / d),
      k = clamp((t - ts) / d);
    x = lerp(XS[a]!, XS[b]!, u);
    // the bead sinks into the bar and resurfaces, then settles with a small damped bounce
    const dive = Math.sin(Math.PI * Math.min(1, k * 1.08));
    rise = 1 - 0.9 * Math.pow(dive, 0.7);
    if (k >= 1) rise = 1 + 0.05 * Math.exp(-(t - ts - d) * 16) * Math.sin((t - ts - d) * 34);
    sx = 1 + 0.55 * Math.sin(Math.PI * k) * (Math.abs(b - a) > 1 ? 1.25 : 1);
    acc = ACC[a]!.map((v, i) => lerp(v, ACC[b]![i]!, u)) as [number, number, number];
    tap = a === b ? [0, -1] : [XS[b]!, t - ts];
    sw = a === b ? 0 : clamp((t - ts - d * 0.9) / 0.4);
    cur = b;
    // the target icon's strokes erase during the second quarter, then redraw from the middle on
    draw = a === b ? 1 : k < 0.5 ? 1 - eIO((k - 0.25) / 0.25) : eOut((t - ts - d * 0.5) / (d * 0.8));
  }
  return { x, rise, sx, acc, tap, sw, cur, draw };
}
