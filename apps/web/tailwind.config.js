/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#2D7080',
          ink: '#245F6D',
          light: '#C8DDE0',
          lighter: '#DFF0F2',
          card: '#D0E2E4',
          accent: '#F5C000',
          accentSoft: '#FEF3C7',
          surface: '#F0F2F2',
          white: '#FFFFFF',
          line: '#E0E0E0',
          ok: '#34C759',
          okSoft: '#D1FAE5',
          warn: '#F59E0B',
          err: '#FF3B30',
          text: '#1A1A1A',
          textMuted: '#6B6B6B',
          textLabel: '#8A8A8E',
          divider: 'rgba(0,0,0,0.1)',
          sidebar: '#1B2F36',
        },
      },
      fontFamily: {
        sans: [
          'SF Pro Display',
          'SF Pro Text',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
