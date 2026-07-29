export const locales = ['en', 'fr', 'sl', 'de', 'pl', 'es', 'id', 'bg', 'pt', 'it', 'ar', 'el', 'nl'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const domainLocales: Record<string, Locale> = {
  'example.com': 'en',
  'example.fr': 'fr',
  'example.si': 'sl',
  'example.de': 'de',
  'example.pl': 'pl',
  'example.es': 'es',
  'example.id': 'id',
  'example.bg': 'bg',
  'example.pt': 'pt',
  'example.it': 'it',
  'example.ae': 'ar',
  'example.gr': 'el',
  'example.nl': 'nl',
  'localhost:3000': 'en',
};

export const localeToMainDomain: Record<Locale, string> = {
  en: 'example.com',
  fr: 'example.fr',
  sl: 'example.si',
  de: 'example.de',
  pl: 'example.pl',
  es: 'example.es',
  id: 'example.id',
  bg: 'example.bg',
  pt: 'example.pt',
  it: 'example.it',
  ar: 'example.ae',
  el: 'example.gr',
  nl: 'example.nl',
};

export const localeNames: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  sl: 'Slovenščina',
  de: 'Deutsch',
  pl: 'Polski',
  es: 'Español',
  id: 'Bahasa Indonesia',
  bg: 'Български',
  pt: 'Português',
  it: 'Italiano',
  ar: 'العربية',
  el: 'Ελληνικά',
  nl: 'Nederlands',
};
