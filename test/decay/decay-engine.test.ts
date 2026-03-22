import { describe, it, expect } from 'vitest';
import { DecayEngineImpl } from '../../src/decay/decay-engine.js';
import { createDecayPolicy } from '../../src/decay/policies.js';
import type { ContextEntry, AccessLog } from '../../src/core/types.js';

function makeEntry(overrides: Partial<ContextEntry> = {}): ContextEntry {
  return {
    id: 'e1',
    type: 'conversational',
    content: 'test',
    createdAt: 0,
    decay: createDecayPolicy('none'),
    references: [],
    metadata: {},
    ...overrides,
  };
}

function makeAccessLog(overrides: Partial<AccessLog> = {}): AccessLog {
  return {
    lastAccessed: new Map(),
    accessCount: new Map(),
    ...overrides,
  };
}

describe('DecayEngine', () => {
  const engine = new DecayEngineImpl();

  describe('scoring', () => {
    it('should return 1.0 for entries with no decay', () => {
      const entry = makeEntry({ decay: createDecayPolicy('none') });
      expect(engine.score(entry, 10000, makeAccessLog())).toBe(1.0);
    });

    it('should decay linearly based on age and halfLife', () => {
      const entry = makeEntry({
        createdAt: 0,
        decay: createDecayPolicy('linear', { halfLife: 1000 }),
      });
      const score = engine.score(entry, 1000, makeAccessLog());
      expect(score).toBeCloseTo(0.5, 1);
    });

    it('should return 0 for very old linear decay entries', () => {
      const entry = makeEntry({
        createdAt: 0,
        decay: createDecayPolicy('linear', { halfLife: 100 }),
      });
      const score = engine.score(entry, 100000, makeAccessLog());
      expect(score).toBeCloseTo(0, 1);
    });

    it('should boost score for frequently accessed entries', () => {
      const entry = makeEntry({
        createdAt: 0,
        decay: createDecayPolicy('linear', { halfLife: 1000 }),
      });
      const accessLog = makeAccessLog({
        accessCount: new Map([['e1', 10]]),
        lastAccessed: new Map([['e1', 900]]),
      });
      const scoreWithAccess = engine.score(entry, 1000, accessLog);
      const scoreWithout = engine.score(entry, 1000, makeAccessLog());
      expect(scoreWithAccess).toBeGreaterThan(scoreWithout);
    });

    it('should use custom scorer when strategy is custom', () => {
      const entry = makeEntry({
        decay: createDecayPolicy('custom', {
          customScorer: (age, count) => age > 500 ? 0 : 1,
        }),
      });
      expect(engine.score(entry, 400, makeAccessLog())).toBe(1);
      expect(engine.score(entry, 600, makeAccessLog())).toBe(0);
    });

    it('should apply accelerated decay for abandoned frame entries', () => {
      const entry = makeEntry({
        createdAt: 0,
        decay: createDecayPolicy('linear', { halfLife: 1000 }),
        metadata: { frameStatus: 'abandoned' },
      });
      const normalEntry = makeEntry({
        createdAt: 0,
        decay: createDecayPolicy('linear', { halfLife: 1000 }),
      });
      const abandonedScore = engine.score(entry, 500, makeAccessLog());
      const normalScore = engine.score(normalEntry, 500, makeAccessLog());
      expect(abandonedScore).toBeLessThan(normalScore);
    });
  });
});
