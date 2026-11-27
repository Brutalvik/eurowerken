import preset from '@eurowerken/shared/tailwind-preset';

/** Corners scale with the shop's design: --site-radius is set from theme.radius (default 1). */
const r = (rem) => `calc(${rem}rem * var(--site-radius, 1))`;

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      borderRadius: {
        sm: r(0.125),
        DEFAULT: r(0.25),
        md: r(0.375),
        lg: r(0.5),
        xl: r(0.75),
        '2xl': r(1),
        '3xl': r(1.5),
      },
    },
  },
};
