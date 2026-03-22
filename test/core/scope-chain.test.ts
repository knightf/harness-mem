import { describe, it, expect } from 'vitest';
import { ScopeChain } from '../../src/core/scope-chain.js';
import { DecayEngineImpl } from '../../src/decay/decay-engine.js';
import { SimpleTokenEstimator } from '../../src/core/utils.js';
import { createDecayPolicy } from '../../src/decay/policies.js';
import type { ContextFrame, ContextEntry, AccessLog } from '../../src/core/types.js';

function makeFrame(id: string, parentId: string | null, entries: ContextEntry[], captures: string[] = []): ContextFrame {
  return {
    id,
    parentId,
    entries,
    captures,
    boundary: { type: 'explicit', description: 'test', confidence: 1 },
    status: 'completed' as const,
  };
}

function makeEntry(id: string, content: string, type: ContextEntry['type'] = 'conversational'): ContextEntry {
  return {
    id,
    type,
    content,
    createdAt: Date.now(),
    decay: createDecayPolicy('none'),
    references: [],
    metadata: {},
  };
}

describe('ScopeChain', () => {
  const decayEngine = new DecayEngineImpl();
  const tokenEstimator = new SimpleTokenEstimator();

  it('should resolve entries from current frame as Tier 1', () => {
    const entry = makeEntry('e1', 'current frame content');
    const frame = makeFrame('f1', null, [entry]);
    const chain = new ScopeChain(decayEngine, tokenEstimator);
    const result = chain.resolve(
      frame,
      new Map([['f1', frame]]),
      new Map([['e1', entry]]),
      [],
      { lastAccessed: new Map(), accessCount: new Map() },
      10000
    );
    expect(result.entries).toContainEqual(expect.objectContaining({ id: 'e1' }));
  });

  it('should resolve captured entries from parent as Tier 2', () => {
    const parentEntry = makeEntry('pe1', 'parent content');
    const parentFrame = makeFrame('f1', null, [parentEntry]);
    const childFrame = makeFrame('f2', 'f1', [], ['pe1']);
    const frames = new Map([['f1', parentFrame], ['f2', childFrame]]);
    const entries = new Map([['pe1', parentEntry]]);
    const chain = new ScopeChain(decayEngine, tokenEstimator);
    const result = chain.resolve(childFrame, frames, entries, [], { lastAccessed: new Map(), accessCount: new Map() }, 10000);
    expect(result.entries).toContainEqual(expect.objectContaining({ id: 'pe1' }));
  });

  it('should include uncaptured parent entries as Tier 3', () => {
    const parentEntry = makeEntry('pe1', 'parent content');
    const parentFrame = makeFrame('f1', null, [parentEntry]);
    const childFrame = makeFrame('f2', 'f1', []);
    childFrame.status = 'active';
    const frames = new Map([['f1', parentFrame], ['f2', childFrame]]);
    const entries = new Map([['pe1', parentEntry]]);
    const chain = new ScopeChain(decayEngine, tokenEstimator);
    const result = chain.resolve(childFrame, frames, entries, [], { lastAccessed: new Map(), accessCount: new Map() }, 10000);
    expect(result.entries).toContainEqual(expect.objectContaining({ id: 'pe1' }));
  });

  it('should respect token budget and drop lowest-scored entries', () => {
    const entries: ContextEntry[] = [];
    for (let i = 0; i < 100; i++) {
      entries.push(makeEntry(`e${i}`, 'x'.repeat(100)));
    }
    const frame = makeFrame('f1', null, entries);
    const entryMap = new Map(entries.map(e => [e.id, e]));
    const chain = new ScopeChain(decayEngine, tokenEstimator);
    const result = chain.resolve(frame, new Map([['f1', frame]]), entryMap, [], { lastAccessed: new Map(), accessCount: new Map() }, 500);
    expect(result.entries.length).toBeLessThan(100);
    expect(result.dropped.length).toBeGreaterThan(0);
    expect(result.totalTokens).toBeLessThanOrEqual(result.budget);
  });

  it('should prioritize Tier 1 over Tier 3 when budget is tight', () => {
    const parentEntry = makeEntry('pe1', 'x'.repeat(200));
    const currentEntry = makeEntry('ce1', 'x'.repeat(200));
    const parentFrame = makeFrame('f1', null, [parentEntry]);
    const childFrame = makeFrame('f2', 'f1', [currentEntry]);
    childFrame.status = 'active';
    const frames = new Map([['f1', parentFrame], ['f2', childFrame]]);
    const entries = new Map([['pe1', parentEntry], ['ce1', currentEntry]]);
    const chain = new ScopeChain(decayEngine, tokenEstimator);
    const result = chain.resolve(childFrame, frames, entries, [], { lastAccessed: new Map(), accessCount: new Map() }, 60);
    const ids = result.entries.map(e => e.id);
    expect(ids).toContain('ce1');
  });
});
