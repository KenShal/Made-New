import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#FFFFFF',
        crimson: { DEFAULT: '#B5122B', deep: '#780D20', blush: '#FBECEF' },
        ink: { DEFAULT: '#171717', muted: '#737373' },
        soft: '#F7F6F4',
        line: '#E7E5E4',
      },
      fontFamily: {
        display: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
      },
      letterSpacing: { tightest: '-0.055em', editorial: '0.18em' },
      fontSize: {
        mega: ['clamp(3rem, 7.4vw, 8.25rem)', { lineHeight: '0.86', letterSpacing: '-0.055em' }],
        giant: ['clamp(2.5rem, 6vw, 6rem)', { lineHeight: '0.9', letterSpacing: '-0.045em' }],
      },
      maxWidth: { frame: '88rem' },
      transitionTimingFunction: { editorial: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    },
  },
  plugins: [],
} satisfies Config;
