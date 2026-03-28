// test/engine/decay.test.ts
import { describe, it, expect } from 'vitest';
import { DecayEngine, createDecayPolicy, GarbageCollector } from '../../src/engine/decay.js';
import type { ContextEntry } from '../../src/engine/types.js';

function makeEntry(overrides: Partial<ContextEntry> = {}): ContextEntry {
  return {
    id: 'e1',
    frameId: 'f1',
    type: 'conversational',
    content: 'test',
    tokenEstimate: 10,
    createdAt: Date.now() - 60000,
    decayPolicy: { strategy: 'none' },
    metadata: {},
    references: [],
    ...overrides,
  };
}

describe('createDecayPolicy', () => {
  it('should create a none policy', () => {
    const policy = createDecayPolicy('none');
    expect(policy.strategy).toBe('none');
  });

  it('should create a linear policy with halfLife', () => {
    const policy = createDecayPolicy('linear', { halfLife: 5000 });
    expect(policy.strategy).toBe('linear');
    expect(policy.halfLife).toBe(5000);
  });

  it('should create a step policy with retainUntil', () => {
    const policy = createDecayPolicy('step', { retainUntil: 3 });
    expect(policy.strategy).toBe('step');
    expect(policy.retainUntil).toBe(3);
  });
});

describe('DecayEngine', () => {
  it('should return 1.0 for none strategy', () => {
    const engine = new DecayEngine();
    const entry = makeEntry({ decayPolicy: { strategy: 'none' } });
    expect(engine.score(entry, 0)).toBe(1.0);
  });

  it('should decay linearly with half-life', () => {
    const engine = new DecayEngine();
    const halfLife = 10000;
    const entry = makeEntry({
      createdAt: Date.now() - halfLife,
      decayPolicy: { strategy: 'linear', halfLife },
    });
    const score = engine.score(entry, 0);
    expect(score).toBeGreaterThan(0.4);
    expect(score).toBeLessThan(0.6);
  });

  it('should apply access boost', () => {
    const engine = new DecayEngine();
    const entry = makeEntry({
      decayPolicy: { strategy: 'linear', halfLife: 10000 },
      createdAt: Date.now() - 10000,
      accessLog: { lastAccessed: Date.now(), accessCount: 5 },
    });
    const boosted = engine.score(entry, 0);
    const entryNoAccess = makeEntry({
      decayPolicy: { strategy: 'linear', halfLife: 10000 },
      createdAt: Date.now() - 10000,
    });
    const unboosted = engine.score(entryNoAccess, 0);
    expect(boosted).toBeGreaterThan(unboosted);
  });

  it('should penalize entries in abandoned frames', () => {
    const engine = new DecayEngine();
    const entry = makeEntry({
      decayPolicy: { strategy: 'linear', halfLife: 60000 },
    });
    const normal = engine.score(entry, 0);
    const penalized = engine.score(entry, 0, true);
    expect(penalized).toBeLessThan(normal);
  });
});

describe('GarbageCollector', () => {
  it('should classify entries into retained, compacted, and collected', () => {
    const gc = new GarbageCollector(new DecayEngine());

    const retained = makeEntry({ id: 'r1', decayPolicy: { strategy: 'none' } });
    const collected = makeEntry({
      id: 'c1',
      createdAt: Date.now() - 1000000,
      decayPolicy: { strategy: 'linear', halfLife: 1000 },
    });

    const result = gc.classify([retained, collected], new Map());
    expect(result.retained.some(e => e.id === 'r1')).toBe(true);
    expect(result.collected.some(e => e.id === 'c1')).toBe(true);
  });
});
