/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        border: 'var(--border)',
        'border-2': 'var(--border-2)',
        'border-3': 'var(--border-3)',
        teal: {
          DEFAULT: 'var(--teal)',
          dim: 'var(--teal-dim)',
          glow: 'var(--teal-glow)',
          border: 'var(--teal-border)',
        },
        blue: {
          DEFAULT: 'var(--blue)',
          dim: 'var(--blue-dim)',
          border: 'var(--blue-border)',
        },
        amber: {
          DEFAULT: 'var(--amber)',
          dim: 'var(--amber-dim)',
          border: 'var(--amber-border)',
        },
        violet: {
          DEFAULT: 'var(--violet)',
          dim: 'var(--violet-dim)',
          border: 'var(--violet-border)',
        },
        red: {
          DEFAULT: 'var(--red)',
          dim: 'var(--red-dim)',
          border: 'var(--red-border)',
        },
        'status-pass': {
          DEFAULT: 'var(--status-pass)',
          bg: 'var(--status-pass-bg)',
          border: 'var(--status-pass-border)',
        },
        'status-warn': {
          DEFAULT: 'var(--status-warn)',
          bg: 'var(--status-warn-bg)',
          border: 'var(--status-warn-border)',
        },
        'status-danger': {
          DEFAULT: 'var(--status-danger)',
          bg: 'var(--status-danger-bg)',
          border: 'var(--status-danger-border)',
        },
        'status-info': {
          DEFAULT: 'var(--status-info)',
          bg: 'var(--status-info-bg)',
          border: 'var(--status-info-border)',
        },
        'status-harvest': {
          DEFAULT: 'var(--status-harvest)',
          bg: 'var(--status-harvest-bg)',
          border: 'var(--status-harvest-border)',
        },
        'on-surface': 'var(--text-on-surface)',
        'progress-track': 'var(--progress-track)',
        tx: {
          1: 'var(--tx-1)',
          2: 'var(--tx-2)',
          3: 'var(--tx-3)',
          4: 'var(--tx-4)',
          inv: 'var(--tx-inv)',
        }
      },
      fontFamily: {
        display: ['Inter', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        xs: '4px',
        sm: '7px',
        DEFAULT: '10px',
        lg: '14px',
        xl: '18px',
      },
      transitionTimingFunction: {
        ease: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'fade-up': 'fadeUp 0.38s cubic-bezier(0.16, 1, 0.3, 1) both',
        'breathe': 'breathe 3s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        breathe: {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 8px var(--teal)' },
          '50%': { opacity: '0.5', boxShadow: '0 0 3px var(--teal)' },
        }
      }
    },
  },
  plugins: [],
}
