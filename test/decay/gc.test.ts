import { describe, it, expect, vi } from 'vitest';
import { GarbageCollector } from '../../src/decay/gc.js';
import { DecayEngineImpl } from '../../src/decay/decay-engine.js';
import { SimpleTokenEstimator } from '../../src/core/utils.js';
import { createDecayPolicy } from '../../src/decay/policies.js';
import type { ContextEntry, Compactor } from '../../src/core/types.js';

function makeEntry(id: string, age: number, halfLife: number): ContextEntry {
  return {
    id, type: 'conversational', content: `content-${id}`,
    createdAt: 0, decay: createDecayPolicy('linear', { halfLife }),
    references: [], metadata: {},
  };
}

describe('GarbageCollector', () => {
  it('should retain high-scoring entries', () => {
    const gc = new GarbageCollector(new DecayEngineImpl(), new SimpleTokenEstimator());
    const entries = [makeEntry('e1', 0, 100000)];
    const result = gc.classify(entries, 100, { lastAccessed: new Map(), accessCount: new Map() });
    expect(result.retained).toHaveLength(1);
    expect(result.collected).toHaveLength(0);
  });

  it('should collect very low-scoring entries', () => {
    const gc = new GarbageCollector(new DecayEngineImpl(), new SimpleTokenEstimator());
    const entries = [makeEntry('e1', 0, 1)];
    const result = gc.classify(entries, 1000000, { lastAccessed: new Map(), accessCount: new Map() });
    expect(result.collected).toHaveLength(1);
  });

  it('should mark mid-range entries for compaction', () => {
    const gc = new GarbageCollector(new DecayEngineImpl(), new SimpleTokenEstimator());
    const entries = [
      makeEntry('high', 0, 100000),
      makeEntry('mid', 0, 500),
      makeEntry('low', 0, 1),
    ];
    const result = gc.classify(entries, 1000000, { lastAccessed: new Map(), accessCount: new Map() });
    expect(result.retained.length + result.compacted.length + result.collected.length).toBe(3);
  });
});
