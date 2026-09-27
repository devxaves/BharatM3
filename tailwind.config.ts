import type { Config } from 'tailwindcss';

const scale = (name: string, steps: (number | string)[]) =>
  Object.fromEntries(steps.map((s) => [s, `rgb(var(--c-${name}-${s}) / <alpha-value>)`]));

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    // Replace (not extend) the palette: default Tailwind colours are intentionally unavailable.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: 'rgb(var(--c-white) / <alpha-value>)',
      primary: scale('primary', [950, 900, 800, 700, 600, 500, 300, 200, 100, 50]),
      teal: scale('teal', [800, 700, 600, 500, 400, 200, 100, 50]),
      grey: scale('grey', [25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
      amber: scale('amber', [800, 700, 600, 500, 200, 100, 50]),
      high: scale('high', [700, 600, 100, 50]),
      veto: scale('veto', [700, 600, 100, 50]),
    },
    fontFamily: {
      display: ['"Inter Tight"', '"IBM Plex Sans"', 'sans-serif'],
      sans: ['"IBM Plex Sans"', 'sans-serif'],
      mono: ['"IBM Plex Mono"', 'monospace'],
    },
    // Type scale tokens (px): 11 / 12 / 13 / 14 / 16 / 20 / 28 / 36
    fontSize: {
      micro: ['11px', { lineHeight: '14px', letterSpacing: '0.02em' }],
      caption: ['12px', { lineHeight: '16px' }],
      dense: ['13px', { lineHeight: '18px' }],
      body: ['14px', { lineHeight: '20px' }],
      lead: ['16px', { lineHeight: '24px' }],
      title: ['20px', { lineHeight: '26px', letterSpacing: '-0.01em' }],
      display: ['28px', { lineHeight: '34px', letterSpacing: '-0.02em' }],
      hero: ['36px', { lineHeight: '40px', letterSpacing: '-0.025em' }],
    },
    borderRadius: {
      none: '0',
      sm: 'var(--radius-sm)',
      DEFAULT: 'var(--radius-md)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      full: '9999px',
    },
    extend: {
      // Deliberately uneven rhythm: 2/6/10/14/18 exist alongside the 4-pt grid for dense rows.
      spacing: { '0.5': '2px', '1.5': '6px', '2.5': '10px', '3.5': '14px', '4.5': '18px', sidebar: 'var(--sidebar-w)', topbar: 'var(--topbar-h)' },
      boxShadow: { panel: 'var(--shadow-panel)', 'card-hover': 'var(--shadow-card-hover)', pop: 'var(--shadow-pop)', none: 'none' },
    },
  },
  plugins: [],
};
export default config;
