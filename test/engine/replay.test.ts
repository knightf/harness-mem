import { describe, it, expect, vi } from 'vitest';
import { ReplayIterator } from '../../src/engine/replay.js';
import { ScopeEngine } from '../../src/engine/scope-engine.js';
import { ToolClusterDetector } from '../../src/engine/boundary.js';
import type { TraceEvent } from '../../src/engine/types.js';

function makeEvents(): TraceEvent[] {
  const now = Date.now();
  return [
    { id: '1', type: 'user-message', content: 'read foo.ts', timestamp: now, tokenEstimate: 10 },
    { id: '2', type: 'tool-call', content: 'Read foo.ts', timestamp: now + 100, tokenEstimate: 5, metadata: { toolName: 'Read' } },
    { id: '3', type: 'tool-result', content: 'file contents...', timestamp: now + 200, tokenEstimate: 50, metadata: { toolName: 'Read' } },
    { id: '4', type: 'tool-call', content: 'Edit foo.ts', timestamp: now + 300, tokenEstimate: 5, metadata: { toolName: 'Edit' }, sideEffect: { hasSideEffect: true, paths: ['foo.ts'] } },
    { id: '5', type: 'tool-result', content: 'edited', timestamp: now + 400, tokenEstimate: 5, metadata: { toolName: 'Edit' } },
    { id: '6', type: 'assistant-text', content: 'Done editing foo.ts', timestamp: now + 500, tokenEstimate: 10 },
  ];
}

describe('ReplayIterator', () => {
  it('should iterate through all events', async () => {
    const events = makeEvents();
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    const detector = new ToolClusterDetector();
    const iterator = new ReplayIterator(events, engine, detector);

    let count = 0;
    while (iterator.hasNext()) {
      await iterator.next();
      count++;
    }
    expect(count).toBe(events.length);
  });

  it('should detect boundaries and push frames', async () => {
    const events = makeEvents();
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    const detector = new ToolClusterDetector();
    const iterator = new ReplayIterator(events, engine, detector);

    await iterator.runAll();
    expect(engine.getFrameCount()).toBeGreaterThan(1);
  });

  it('should record side effects as artifacts', async () => {
    const events = makeEvents();
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    const detector = new ToolClusterDetector();
    const iterator = new ReplayIterator(events, engine, detector);

    const result = await iterator.runAll();
    expect(result.sideEffects.length).toBeGreaterThan(0);
  });

  it('should support resolution point inspection', async () => {
    const events = makeEvents();
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    const detector = new ToolClusterDetector();
    const iterator = new ReplayIterator(events, engine, detector);

    const result = await iterator.runAll();
    expect(result.resolutions.length).toBeGreaterThan(0);
  });

  it('should track frame timeline', async () => {
    const events = makeEvents();
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    const detector = new ToolClusterDetector();
    const iterator = new ReplayIterator(events, engine, detector);

    const result = await iterator.runAll();
    expect(result.frames.length).toBeGreaterThan(0);
  });
});
