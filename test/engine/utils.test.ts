import { describe, it, expect } from 'vitest';
import { generateId, normalizePath, estimateTokens, parseDuration } from '../../src/engine/utils.js';

describe('generateId', () => {
  it('should return a UUID string', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should return unique IDs', () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
  });
});

describe('normalizePath', () => {
  it('should resolve relative paths against working directory', () => {
    const result = normalizePath('src/foo.ts', '/home/user/project');
    expect(result).toContain('src/foo.ts');
  });

  it('should lowercase for case-insensitive comparison', () => {
    const result = normalizePath('/Home/User/File.ts');
    expect(result).toBe(result.toLowerCase());
  });
});

describe('estimateTokens', () => {
  it('should estimate tokens as length / 4', () => {
    expect(estimateTokens('hello world')).toBe(3); // 11 / 4 = 2.75 → 3
  });

  it('should handle null/undefined', () => {
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
  });
});

describe('parseDuration', () => {
  it('should parse hours', () => {
    expect(parseDuration('24h')).toBe(24 * 60 * 60 * 1000);
  });

  it('should parse days', () => {
    expect(parseDuration('30d')).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('should parse minutes', () => {
    expect(parseDuration('15m')).toBe(15 * 60 * 1000);
  });

  it('should throw on invalid format', () => {
    expect(() => parseDuration('abc')).toThrow();
  });
});
