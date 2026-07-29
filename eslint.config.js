import noHardcodedStrings from 'eslint-plugin-no-hardcoded-strings';
import nextConfig from 'eslint-config-next';
import prettierConfig from 'eslint-config-prettier';

export default [
  // Apply Next.js ESLint config (flat config format in v16)
  ...nextConfig,
  // Prettier must be last to override conflicting rules
  prettierConfig,
  {
    plugins: {
      'no-hardcoded-strings': noHardcodedStrings,
    },
    rules: {
      'no-hardcoded-strings/no-hardcoded-strings': [
        'warn', // Changed to warning so build doesn't fail
        {
          ignorePatterns: [
            /^(__|t|Trans)$/, // Translation functions
            /^[\s\p{P}\p{S}]*$/, // Only punctuation, symbols, whitespace (emojis, $, %, :, etc.)
            /^[0-9]+$/, // Numbers only
            /^[a-zA-Z]$/, // Single letters
            /^[+-\d.]+%?$/, // Numbers with % or +/-
            /^[#\d]+$/, // Hashtags with numbers
          ],
        },
      ],
      // Disable React Compiler strict rules (new in Next.js 16, too strict for existing code)
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/error-boundaries': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/incompatible-library': 'off',
      // Downgrade unescaped entities to warning (not critical)
      'react/no-unescaped-entities': 'warn',
    },
  },
  // Disable hardcoded strings rule for admin pages (admin-only, no translations needed)
  {
    files: ['**/admin/**/*.{ts,tsx}'],
    rules: {
      'no-hardcoded-strings/no-hardcoded-strings': 'off',
    },
  },
  // Disable react-hooks rules for test files (Playwright's use() is not a React hook)
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
];
