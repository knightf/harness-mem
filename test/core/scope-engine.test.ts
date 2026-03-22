import { describe, it, expect } from 'vitest';
import { ScopeEngineImpl } from '../../src/core/scope-engine.js';
import { createDecayPolicy } from '../../src/decay/policies.js';
import type { ContextEntry } from '../../src/core/types.js';

describe('ScopeEngine', () => {
  function createEngine() {
    return new ScopeEngineImpl({ frameDepthLimit: 100 }, '/project');
  }

  it('should start with a root frame', () => {
    const engine = createEngine();
    const frame = engine.getCurrentFrame();
    expect(frame).not.toBeNull();
    expect(frame.parentId).toBeNull();
  });

  it('should push a new frame as child of current', () => {
    const engine = createEngine();
    const rootId = engine.getCurrentFrame().id;
    engine.pushFrame({ type: 'user-input', description: 'new step', confidence: 1 });
    const newFrame = engine.getCurrentFrame();
    expect(newFrame.parentId).toBe(rootId);
  });

  it('should pop frame and return to parent', () => {
    const engine = createEngine();
    const rootId = engine.getCurrentFrame().id;
    const child = engine.pushFrame({ type: 'user-input', description: 'step', confidence: 1 });
    engine.popFrame(child.id);
    expect(engine.getCurrentFrame().id).toBe(rootId);
  });

  it('should add entries to current frame', () => {
    const engine = createEngine();
    engine.addEntry({
      id: 'e1',
      type: 'conversational',
      content: 'hello',
      createdAt: Date.now(),
      decay: createDecayPolicy('none'),
      references: [],
      metadata: {},
    });
    expect(engine.getCurrentFrame().entries).toHaveLength(1);
    expect(engine.getEntry('e1')).not.toBeNull();
  });

  it('should capture entries from parent frame', () => {
    const engine = createEngine();
    engine.addEntry({
      id: 'e1', type: 'conversational', content: 'parent content',
      createdAt: Date.now(), decay: createDecayPolicy('none'), references: [], metadata: {},
    });
    engine.pushFrame({ type: 'tool-cluster', description: 'new cluster', confidence: 0.8 });
    engine.capture(['e1']);
    expect(engine.getCurrentFrame().captures).toContain('e1');
  });

  it('should abandon frame and mark status', () => {
    const engine = createEngine();
    const child = engine.pushFrame({ type: 'user-input', description: 'step', confidence: 1 });
    engine.abandonFrame(child.id);
    expect(child.status).toBe('abandoned');
  });

  it('should record and retrieve side effects', () => {
    const engine = createEngine();
    engine.recordSideEffect({
      id: 'a1', location: '/project/file.ts', snapshots: [], currentState: 'v1',
    });
    expect(engine.getArtifact('/project/file.ts')).not.toBeNull();
  });

  it('should resolve context with budget', () => {
    const engine = createEngine();
    engine.addEntry({
      id: 'e1', type: 'conversational', content: 'hello',
      createdAt: Date.now(), decay: createDecayPolicy('none'), references: [], metadata: {},
    });
    const result = engine.resolve(10000);
    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.budget).toBe(10000);
  });
});
