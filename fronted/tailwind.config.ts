/**
 * Tailwind v4 uses CSS-first config (@theme in tokens.css).
 * This file exists for IDE autocomplete and tooling that expects a JS config.
 * The authoritative source of truth is src/styles/tokens.css @theme block.
 */
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}', './fronted/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:        'var(--bg)',
        surface:   'var(--surface)',
        surface2:  'var(--surface2)',
        surface3:  'var(--surface3)',
        border:    'var(--border)',
        border2:   'var(--border2)',
        t0:        'var(--t0)',
        t1:        'var(--t1)',
        t2:        'var(--t2)',
        t3:        'var(--t3)',
        green: {
          DEFAULT: 'var(--green)',
          bg:      'var(--green-bg)',
          b:       'var(--green-b)',
          t:       'var(--green-t)',
        },
        red: {
          DEFAULT: 'var(--red)',
          bg:      'var(--red-bg)',
          b:       'var(--red-b)',
          t:       'var(--red-t)',
        },
        blue: {
          DEFAULT: 'var(--blue)',
          bg:      'var(--blue-bg)',
          b:       'var(--blue-b)',
          t:       'var(--blue-t)',
        },
        amber: {
          DEFAULT: 'var(--amber)',
          bg:      'var(--amber-bg)',
          b:       'var(--amber-b)',
          t:       'var(--amber-t)',
        },
        purple: {
          DEFAULT: 'var(--purple)',
          bg:      'var(--purple-bg)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      borderRadius: {
        r4:  '4px',
        r6:  '6px',
        r8:  '8px',
        r10: '10px',
        r12: '12px',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow)',
        lg: 'var(--shadow-lg)',
      },
    },
  },
}

export default config
