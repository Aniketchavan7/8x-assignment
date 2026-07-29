import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Escapes a search string for safe use in PostgREST `.or()` / `.ilike()` filters.
 * Handles both ILIKE wildcards (`%`, `_`, `\`) and PostgREST filter metacharacters
 * (`,` delimits conditions, `.()` are part of filter syntax, `"` for quoting).
 */
export function sanitizeSearchFilter(search: string): string {
  return search.replace(/[%_\\,.()"]/g, '\\$&');
}
