/**
 * Minimal Tailwind v4 config for:
 * - Typography
 * - tw-animate-css
 * - Dark mode via `.dark`
 * - ShadCN-style CSS theme (handled entirely in your CSS)
 */

import typography from '@tailwindcss/typography';
import animate from 'tw-animate-css';

export default {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './content/**/*.{md,mdx}',
  ],
  plugins: [typography, animate],
};
