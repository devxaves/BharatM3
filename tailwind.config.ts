import type { Config } from 'tailwindcss';

const scale = (name: string, steps: (number | string)[]) =>
  Object.fromEntries(steps.map((s) => [s, `rgb(var(--c-${name}-${s}) / <alpha-value>)`]));

const FULL = [950, 900, 800, 700, 600, 500, 400, 300, 200, 100, 50];

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    // Replace (not extend) the palette: default Tailwind colours are intentionally unavailable.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: 'rgb(var(--c-white) / <alpha-value>)',
      primary: scale('primary', FULL),
      teal: scale('teal', [900, 800, 700, 600, 500, 400, 300, 200, 100, 50]),
      grey: scale('grey', [25, 50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
      amber: scale('amber', [900, 800, 700, 600, 500, 400, 300, 200, 100, 50]),
      high: scale('high', [900, 800, 700, 600, 500, 400, 200, 100, 50]),
      veto: scale('veto', [900, 800, 700, 600, 500, 400, 300, 200, 100, 50]),
      warning: scale('warning', [600, 100]),
    },
    fontFamily: {
      display: ['Inter', 'system-ui', 'sans-serif'],
      sans: ['Inter', 'system-ui', 'sans-serif'],
      mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
    },
    // Type scale (px). Semantic names first, Tailwind-style aliases kept for existing markup.
    fontSize: {
      micro: ['11px', { lineHeight: '14px', letterSpacing: '0.02em' }],
      caption: ['12px', { lineHeight: '16px' }],
      dense: ['13px', { lineHeight: '18px' }],
      body: ['14px', { lineHeight: '21px' }],
      lead: ['16px', { lineHeight: '24px' }],
      card: ['18px', { lineHeight: '24px', letterSpacing: '-0.01em' }],
      title: ['20px', { lineHeight: '26px', letterSpacing: '-0.01em' }],
      display: ['28px', { lineHeight: '34px', letterSpacing: '-0.02em' }],
      kpi: ['36px', { lineHeight: '40px', letterSpacing: '-0.025em' }],
      hero: ['36px', { lineHeight: '42px', letterSpacing: '-0.025em' }],
      section: ['34px', { lineHeight: '40px', letterSpacing: '-0.025em' }],
      jumbo: ['56px', { lineHeight: '60px', letterSpacing: '-0.035em' }],
      base: ['15px', { lineHeight: '22px' }],
      '2xl': ['24px', { lineHeight: '30px', letterSpacing: '-0.02em' }],
      '3xl': ['32px', { lineHeight: '38px', letterSpacing: '-0.025em' }],
      '4xl': ['40px', { lineHeight: '46px', letterSpacing: '-0.03em' }],
      '5xl': ['48px', { lineHeight: '52px', letterSpacing: '-0.03em' }],
      '6xl': ['60px', { lineHeight: '64px', letterSpacing: '-0.035em' }],
    },
    borderRadius: {
      none: '0',
      sm: 'var(--radius-sm)',
      DEFAULT: 'var(--radius-sm)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-md)',
      xl: 'var(--radius-xl)',
      '2xl': 'var(--radius-2xl)',
      full: '9999px',
    },
    extend: {
      // Deliberately uneven rhythm: 2/6/10/14/18 exist alongside the 4-pt grid for dense rows.
      spacing: { '0.5': '2px', '1.5': '6px', '2.5': '10px', '3.5': '14px', '4.5': '18px', '8.5': '34px', topbar: 'var(--topbar-h)', navbar: 'var(--navbar-h)' },
      boxShadow: {
        '2xs': '0 1px 1px 0 rgb(23 33 27 / 0.03)',
        panel: 'var(--shadow-panel)',
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        elevated: 'var(--shadow-elevated)',
        pop: 'var(--shadow-pop)',
        none: 'none',
      },
    },
  },
  plugins: [],
};
export default config;
