import { describe, it, expect } from 'vitest';
import { generateId, normalizePath, SimpleTokenEstimator } from '../../src/core/utils.js';

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('should generate string IDs', () => {
    expect(typeof generateId()).toBe('string');
  });
});

describe('normalizePath', () => {
  it('should resolve relative paths to absolute', () => {
    const result = normalizePath('./src/file.ts', '/home/user/project');
    expect(result).toContain('src');
    expect(result).toContain('file.ts');
  });

  it('should lowercase the result', () => {
    const result = normalizePath('/Home/User/File.TS', '/');
    expect(result).toBe(result.toLowerCase());
  });

  it('should handle absolute paths', () => {
    const result = normalizePath('/absolute/path/file.ts', '/other');
    expect(result).toContain('absolute');
    expect(result).toContain('file.ts');
  });
});

describe('SimpleTokenEstimator', () => {
  it('should estimate tokens for a string', () => {
    const estimator = new SimpleTokenEstimator();
    const tokens = estimator.estimate('hello world');
    expect(tokens).toBeGreaterThan(0);
    expect(typeof tokens).toBe('number');
  });

  it('should estimate tokens for objects by JSON stringifying', () => {
    const estimator = new SimpleTokenEstimator();
    const tokens = estimator.estimate({ key: 'value', nested: { a: 1 } });
    expect(tokens).toBeGreaterThan(0);
  });

  it('should return 0 for null/undefined', () => {
    const estimator = new SimpleTokenEstimator();
    expect(estimator.estimate(null)).toBe(0);
    expect(estimator.estimate(undefined)).toBe(0);
  });
});
