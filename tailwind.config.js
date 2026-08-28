/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        raised: 'rgb(var(--c-raised) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        faint: 'rgb(var(--c-faint) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-soft': 'rgb(var(--c-accent-soft) / <alpha-value>)',
        warm: 'rgb(var(--c-warm) / <alpha-value>)',
        calm: 'rgb(var(--c-calm) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        display: ['SF Pro Display', '-apple-system', 'BlinkMacSystemFont', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgb(60 46 34 / 0.04), 0 6px 20px -8px rgb(60 46 34 / 0.10)',
        lift: '0 2px 4px rgb(60 46 34 / 0.05), 0 18px 44px -16px rgb(60 46 34 / 0.22)',
        node: '0 2px 6px rgb(60 46 34 / 0.06), 0 10px 28px -12px rgb(60 46 34 / 0.24)',
      },
      borderRadius: { xl2: '1.75rem', xl3: '2.25rem' },
    },
  },
  plugins: [],
}
