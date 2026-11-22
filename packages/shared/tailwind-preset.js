import plugin from 'tailwindcss/plugin';

/**
 * Shared Tailwind setup for every web app. Each app defines the colour
 * values as CSS variables (RGB triplets) in its own index.css, so apps and
 * workshops can theme without changing class names.
 */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        surface2: token('surface2'),
        line: token('line'),
        fg: token('fg'),
        fg2: token('fg2'),
        fg3: token('fg3'),
        accent: token('accent'),
        ok: token('ok'),
        warn: token('warn'),
        bad: token('bad'),
        violet: token('violet'),
        sidebar: token('sidebar'),
        ink: token('ink'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    plugin(({ addVariant }) => {
      // Touch screens (phones, tablets): bigger targets. Use as coarse:min-h-11.
      addVariant('coarse', '@media (pointer: coarse)');
    }),
  ],
};
