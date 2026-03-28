import { describe, it, expect } from 'vitest';
import { ScopeEngine } from '../../src/engine/scope-engine.js';
import type { BoundarySignal } from '../../src/engine/types.js';

describe('ScopeEngine', () => {
  it('should start with one root frame', () => {
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    expect(engine.getCurrentFrame()).not.toBeNull();
    expect(engine.getFrameCount()).toBe(1);
  });

  it('should push a new frame on boundary', () => {
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    const signal: BoundarySignal = { type: 'tool-cluster', confidence: 0.8 };
    engine.pushFrame(signal);
    expect(engine.getFrameCount()).toBe(2);
  });

  it('should add entries to current frame', () => {
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    const entryId = engine.addEntry({
      type: 'conversational',
      content: 'test',
      tokenEstimate: 10,
      decayPolicy: { strategy: 'none' },
    });
    expect(entryId).toBeDefined();
  });

  it('should resolve context with token budget', () => {
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    engine.addEntry({
      type: 'conversational',
      content: 'entry 1',
      tokenEstimate: 100,
      decayPolicy: { strategy: 'none' },
    });
    engine.addEntry({
      type: 'side-effect',
      content: 'file created',
      tokenEstimate: 50,
      decayPolicy: { strategy: 'none' },
    });
    const resolved = engine.resolve(500);
    expect(resolved.entries.length).toBe(2);
    expect(resolved.totalTokens).toBe(150);
  });

  it('should respect token budget by dropping low-scored entries', () => {
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    for (let i = 0; i < 20; i++) {
      engine.addEntry({
        type: 'conversational',
        content: `entry ${i}`,
        tokenEstimate: 100,
        decayPolicy: { strategy: 'linear', halfLife: 5000 },
      });
    }
    const resolved = engine.resolve(500);
    expect(resolved.totalTokens).toBeLessThanOrEqual(500);
    expect(resolved.droppedEntries).toBeGreaterThan(0);
  });

  it('should record side effects as artifacts', () => {
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    engine.recordSideEffect({
      id: 'a1',
      type: 'file',
      location: 'src/foo.ts',
      state: 'created',
      createdAt: Date.now(),
    });
    const resolved = engine.resolve(1000);
    expect(resolved.artifacts.length).toBe(1);
  });

  it('should pop frame and complete it', () => {
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    engine.pushFrame({ type: 'tool-cluster', confidence: 0.8 });
    expect(engine.getFrameCount()).toBe(2);
    engine.popFrame();
    expect(engine.getFrameCount()).toBe(1);
  });
});
