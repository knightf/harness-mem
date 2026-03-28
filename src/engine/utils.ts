import * as path from 'path';

/**
 * Generate a unique identifier using native crypto.randomUUID().
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Normalize a file path to a consistent lowercase string with forward slashes.
 * Resolves relative paths against the provided working directory (or process.cwd()).
 */
export function normalizePath(p: string, cwd?: string): string {
  const resolved = path.resolve(cwd || process.cwd(), p);
  return resolved.replace(/\\/g, '/').toLowerCase();
}

/**
 * Estimate the number of tokens in the given content.
 * - null/undefined → 0
 * - string → Math.ceil(length / 4)
 * - object → JSON.stringify, then estimate string length
 */
export function estimateTokens(content: unknown): number {
  if (content == null) {
    return 0;
  }
  if (typeof content === 'string') {
    return Math.ceil(content.length / 4);
  }
  const str = JSON.stringify(content);
  return Math.ceil(str.length / 4);
}

/**
 * Parse a duration string (e.g. "15m", "24h", "30d") into milliseconds.
 * Supports: m (minutes), h (hours), d (days).
 * Throws on unrecognized format.
 */
export function parseDuration(str: string): number {
  const match = str.match(/^(\d+)(m|h|d)$/);
  if (!match) {
    throw new Error(
      `Invalid duration format: "${str}". Expected a number followed by m (minutes), h (hours), or d (days).`
    );
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      // This branch is unreachable given the regex, but satisfies the type checker.
      throw new Error(`Unknown duration unit: "${unit}"`);
  }
}
