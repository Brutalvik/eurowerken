import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { VIEW, XS, fitScale } from './geometry';
import { createScene, drawOverlay } from './scene';
import type { Scene } from './scene';
import { moveLength, restingOn, state } from './timeline';
import type { Move } from './timeline';
import styles from './FlowTabBar.module.css';

export interface FlowTab {
  label: string;
  to: string;
  icon: ReactNode;
}

/** How long the scene keeps animating after a move lands (bounce, sweep, ripple). */
const SETTLE = 0.9;

/**
 * The liquid-glass tab bar (five tabs): a dark glass bar whose active tab is a bead of liquid glass. The bead
 * follows `active` (the current page's tab, or -1 to stay where it is); the tabs are real links. Renders with one
 * WebGL2 shader; falls back to a plain glass bar without WebGL. Reduced motion: the bead jumps, no animation.
 */
export function FlowTabBar({ tabs, active }: { tabs: FlowTab[]; active: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const icons = useRef<HTMLDivElement[]>([]);
  const labels = useRef<HTMLDivElement[]>([]);
  const [scale, setScale] = useState(() => fitScale(window.innerWidth));
  const [failed, setFailed] = useState(false);
  // Tab whose name is shown in the hover / keyboard-focus tooltip.
  const [hint, setHint] = useState<number | null>(null);

  // Motion state shared between the effects (not React state: it changes every frame).
  const engine = useRef<{
    scene: Scene | null;
    moves: Move[];
    cur: number;
    pending: number | null;
    t0: number;
    raf: number;
    reduce: boolean;
    tick: () => void;
    go: (i: number) => void;
  }>({
    scene: null,
    moves: restingOn(Math.max(0, active)),
    cur: Math.max(0, active),
    pending: null,
    t0: performance.now() / 1000,
    raf: 0,
    reduce: false,
    tick: () => {},
    go: () => {},
  });

  useEffect(() => {
    const onResize = () => setScale(fitScale(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Set up WebGL once; tear it down on unmount (StrictMode runs this twice in development).
  useEffect(() => {
    const e = engine.current;
    e.reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const overlay = { icons: icons.current, labels: labels.current };
    const now = () => performance.now() / 1000 - e.t0;

    const frame = () => {
      const tl = now();
      const last = e.moves[e.moves.length - 1];
      if (e.pending !== null && (!last || tl >= last.ts + last.d)) {
        if (e.pending !== e.cur) {
          e.moves = [{ ts: tl, a: e.cur, b: e.pending, d: moveLength(Math.abs(e.pending - e.cur)) }];
          e.cur = e.pending;
        }
        e.pending = null;
      }
      const s = state(tl, e.moves);
      if (e.scene) e.scene.draw(s, tl);
      else drawOverlay(overlay, s);
      const end = e.moves[e.moves.length - 1];
      const busy = e.pending !== null || (end ? tl < end.ts + end.d + SETTLE : false);
      e.raf = busy ? requestAnimationFrame(frame) : 0;
    };
    e.tick = () => {
      if (!e.raf) e.raf = requestAnimationFrame(frame);
    };
    // Start the bead on the tap itself, not after the new page has rendered.
    e.go = (i: number) => {
      if (e.reduce) {
        e.moves = restingOn(i);
        e.cur = i;
        e.pending = null;
      } else {
        e.pending = i;
      }
      e.tick();
    };

    if (canvas.current) {
      try {
        e.scene = createScene(canvas.current, overlay);
      } catch (err) {
        console.warn('Tab bar: WebGL2 unavailable, using the plain bar.', err);
        setFailed(true);
      }
    }
    e.scene?.layout(fitScale(window.innerWidth));
    e.tick();

    return () => {
      cancelAnimationFrame(e.raf);
      e.raf = 0;
      e.scene?.dispose();
      e.scene = null;
    };
  }, []);

  // Size the canvas for the current scale and redraw.
  useLayoutEffect(() => {
    const e = engine.current;
    e.scene?.layout(scale);
    e.tick();
  }, [scale]);

  // Follow the current page's tab.
  useEffect(() => {
    if (active < 0) return;
    engine.current.go(active);
  }, [active]);

  const width = VIEW.w * scale;
  const height = VIEW.h * scale;

  return (
    <nav aria-label="Main" className={styles.dock} style={{ width, height }}>
      {!failed && <canvas ref={canvas} className={styles.gl} aria-hidden="true" />}
      <div ref={stage} className={styles.stage} style={{ transform: `scale(${scale})` }}>
        {failed && <div className={styles.fallback} aria-hidden="true" />}
        {tabs.map((t, i) => (
          <div
            key={t.to}
            ref={(el) => void (labels.current[i] = el!)}
            className={styles.label}
            // Labels stay readable when the bar is scaled down on phones: at least 10.5 CSS px.
            style={{ fontSize: `${Math.max(14, 10.5 / scale)}px` }}
            aria-hidden="true"
          >
            {t.label}
          </div>
        ))}
        {tabs.map((t, i) => (
          <div key={t.to} ref={(el) => void (icons.current[i] = el!)} className={styles.icon} aria-hidden="true">
            {t.icon}
          </div>
        ))}
        {tabs.map((t, i) => (
          <Link
            key={t.to}
            to={t.to}
            className={styles.tab}
            style={{ left: `${XS[i]! - 75 - VIEW.x}px` }}
            aria-current={active === i ? 'page' : undefined}
            onPointerDown={(ev) => {
              if (ev.button === 0) engine.current.go(i);
              setHint(null);
            }}
            onPointerEnter={(ev) => ev.pointerType === 'mouse' && setHint(i)}
            onPointerLeave={() => setHint((h) => (h === i ? null : h))}
            onFocus={(ev) => ev.currentTarget.matches(':focus-visible') && setHint(i)}
            onBlur={() => setHint((h) => (h === i ? null : h))}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div
          key={t.to}
          aria-hidden="true"
          className={`${styles.tooltip} ${hint === i && active !== i ? styles.tooltipOn : ''}`}
          // Above the bar's top edge (stage y 538, the band's y 88), centred on the tab.
          style={{ left: (XS[i]! - VIEW.x) * scale, top: 88 * scale - 10 }}
        >
          {t.label}
        </div>
      ))}
    </nav>
  );
}
