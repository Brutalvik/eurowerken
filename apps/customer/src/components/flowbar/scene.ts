import { BY, VIEW, XS } from './geometry';
import { clamp, lerp } from './math';
import { FS, VS } from './shaders';
import type { SceneState } from './timeline';

export type Overlay = { icons: HTMLElement[]; labels: HTMLElement[] };

const UNIFORMS = ['uRes', 'uDpr', 'uT', 'uView', 'uB', 'uAcc', 'uTap', 'uSw'] as const;

/**
 * Places the icons and labels for a state (stage band coordinates). Used with WebGL and by the plain fallback.
 */
export function drawOverlay({ icons, labels }: Overlay, s: SceneState): void {
  icons.forEach((el, i) => {
    // w: how close the bead is to this tab; a: how far this icon rides up with it
    const w = Math.pow(clamp(1 - Math.abs(s.x - XS[i]!) / 96), 1.5),
      a = w * clamp(s.rise);
    el.style.transform = `translate(${XS[i]! - 22 - VIEW.x}px,${BY - 22 - VIEW.y - 72 * a}px) scale(${1 + 0.1 * a})`;
    el.style.opacity = String(lerp(0.34, 1, clamp(a * 1.3)));
    const dr = i === s.cur ? s.draw : 1;
    el.querySelectorAll<SVGElement>('[pathLength]').forEach((q) => (q.style.strokeDashoffset = String(1 - dr)));
    // the label fades in from blur where the icon sat, once the icon is more than halfway up
    const lb = labels[i];
    if (!lb) return;
    const la = Math.pow(clamp((a - 0.55) / 0.45), 1.5);
    lb.style.opacity = String(la * 0.9);
    lb.style.transform = `translate(${XS[i]! - 60 - VIEW.x}px,${BY - 4 - VIEW.y + 10 * (1 - la)}px)`;
    lb.style.filter = `blur(${(1 - la) * 5}px)`;
  });
}

export type Scene = {
  layout: (scale: number) => void;
  draw: (s: SceneState, t: number) => void;
  dispose: () => void;
};

/** WebGL2 on the canvas (throws when unavailable). The canvas covers the stage band VIEW at `scale`. */
export function createScene(canvas: HTMLCanvasElement, overlay: Overlay): Scene {
  const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: true, alpha: true });
  if (!gl) throw new Error('WebGL2 is not available');
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  let K = 1;

  const compile = (type: number, src: string) => {
    const x = gl.createShader(type)!;
    gl.shaderSource(x, src);
    gl.compileShader(x);
    if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x) ?? 'shader error');
    return x;
  };
  const vs = compile(gl.VERTEX_SHADER, VS);
  const fs = compile(gl.FRAGMENT_SHADER, FS);
  const pr = gl.createProgram()!;
  gl.attachShader(pr, vs);
  gl.attachShader(pr, fs);
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr) ?? 'link error');
  gl.useProgram(pr);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const al = gl.getAttribLocation(pr, 'a');
  gl.enableVertexAttribArray(al);
  gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
  const U = Object.fromEntries(UNIFORMS.map((n) => [n, gl.getUniformLocation(pr, n)])) as Record<
    (typeof UNIFORMS)[number],
    WebGLUniformLocation | null
  >;

  const layout = (scale: number) => {
    K = scale;
    canvas.width = Math.round(VIEW.w * K * DPR);
    canvas.height = Math.round(VIEW.h * K * DPR);
  };

  const draw = (s: SceneState, t: number) => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uDpr, DPR);
    gl.uniform1f(U.uT, t);
    // p = (fragment - uView.xy) / scale + 540 maps the canvas onto the stage band starting at VIEW.x, VIEW.y
    gl.uniform3f(U.uView, (540 - VIEW.x) * K, (540 - VIEW.y) * K, K);
    gl.uniform3f(U.uB, s.x, s.rise, s.sx);
    gl.uniform3fv(U.uAcc, s.acc);
    gl.uniform3f(U.uTap, s.tap[0], s.tap[1], 0);
    gl.uniform1f(U.uSw, s.sw);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drawOverlay(overlay, s);
  };

  const dispose = () => {
    gl.deleteBuffer(vb);
    gl.deleteProgram(pr);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  };

  return { layout, draw, dispose };
}
