/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // comstruct design tokens (spec §6 web)
        brand: {
          DEFAULT: '#0F2A44',  // construction navy
          ink: '#0B1B2E',
          accent: '#F2A341',   // safety orange
          surface: '#F5F7FA',
          line: '#E1E7EE',
          ok: '#1F8A4C',
          warn: '#D97706',
          err: '#B0210C',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
