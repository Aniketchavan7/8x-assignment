/**
 * Security utilities for preventing directory traversal and path manipulation attacks
 */

/**
 * Validates a slug to prevent directory traversal attacks
 * @param slug - The slug to validate
 * @returns true if valid, false if contains dangerous characters
 */
export function isValidSlug(slug: string): boolean {
  if (!slug || typeof slug !== 'string') {
    return false;
  }

  // Prevent directory traversal
  if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
    return false;
  }

  // Prevent null bytes and other dangerous characters
  if (slug.includes('\0')) {
    return false;
  }

  // Prevent absolute paths
  if (slug.startsWith('/') || slug.startsWith('\\')) {
    return false;
  }

  return true;
}

/**
 * Validates a file path to prevent directory traversal attacks
 * @param filePath - The file path to validate (can be a single filename or path segments)
 * @returns true if valid, false if contains dangerous characters
 */
export function isValidFilePath(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  // Prevent directory traversal
  if (filePath.includes('..') || filePath.includes('\\')) {
    return false;
  }

  // Prevent null bytes
  if (filePath.includes('\0')) {
    return false;
  }

  // Prevent absolute paths (leading slash is allowed for relative paths in some contexts,
  // but we'll be strict and disallow it to prevent confusion)
  if (filePath.startsWith('/')) {
    return false;
  }

  return true;
}

