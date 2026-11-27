import preset from '@eurowerken/shared/tailwind-preset';

/** Every duration is scaled by --motion-scale (0 when the user prefers reduced motion; see index.css). */
const ms = (n) => `calc(${n}ms * var(--motion-scale, 1))`;

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    transitionDuration: {
      DEFAULT: ms(180),
      0: '0ms',
      75: ms(75),
      100: ms(100),
      150: ms(150),
      200: ms(200),
      300: ms(300),
      500: ms(500),
      700: ms(700),
      1000: ms(1000),
    },
    extend: {
      // Compositor-friendly, Apple-style ease-out: settles quickly with no bounce.
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.16, 1, 0.3, 1)',
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'glass-in': {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.985)' },
          to: { opacity: '1', transform: 'none' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'voice-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.55' },
          '50%': { transform: 'scale(1.12)', opacity: '0.9' },
        },
      },
      animation: {
        'glass-in': `glass-in ${ms(200)} cubic-bezier(0.16, 1, 0.3, 1) both`,
        'fade-in': `fade-in ${ms(160)} cubic-bezier(0.16, 1, 0.3, 1) both`,
        // Reduced motion: --motion-scale 0 gives a zero duration, which CSS treats as no animation.
        'voice-pulse': `voice-pulse ${ms(1400)} ease-in-out infinite`,
      },
    },
  },
};
