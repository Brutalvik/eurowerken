/**
 * 44 x 44 line icons for the tab bar (stroke set in CSS). Stroked shapes have pathLength 1 and a dash of 1, so the
 * scene can erase and redraw them (dash offset 1 = erased, 0 = drawn). Filled dots never erase.
 */
const draw = { pathLength: 1, style: { strokeDasharray: '1' } };

export const HomeIcon = (
  <svg viewBox="0 0 44 44" aria-hidden="true">
    <path d="M10 34V20a12 12 0 0 1 24 0v14" {...draw} />
    <path d="M22 34v-8" {...draw} />
  </svg>
);

export const ServicesIcon = (
  <svg viewBox="0 0 44 44" aria-hidden="true">
    <path d="M28 9a7 7 0 0 0-6.6 9.4L10.6 29.2a3 3 0 0 0 4.2 4.2l10.8-10.8A7 7 0 0 0 35 16l-4.6 4.6-4.4-1.2-1.2-4.4L29.4 10.4A7 7 0 0 0 28 9z" {...draw} />
  </svg>
);

export const PartsIcon = (
  <svg viewBox="0 0 44 44" aria-hidden="true">
    <path d="M9 15l13-6.5L35 15v14l-13 6.5L9 29z" {...draw} />
    <path d="M9 15l13 6.5L35 15M22 21.5v14" {...draw} />
  </svg>
);

export const TrackIcon = (
  <svg viewBox="0 0 44 44" aria-hidden="true">
    <path d="M10 22a12 12 0 1 1 12 12" {...draw} />
    <path d="M22 15v7l5 4" {...draw} />
    <circle cx="12" cy="32" r="2" fill="currentColor" stroke="none" />
  </svg>
);

export const GarageIcon = (
  <svg viewBox="0 0 44 44" aria-hidden="true">
    <circle cx="22" cy="15" r="6" {...draw} />
    <path d="M10 35a12 12 0 0 1 24 0" {...draw} />
  </svg>
);
