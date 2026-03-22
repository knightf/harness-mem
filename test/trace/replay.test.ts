import { describe, it, expect, vi } from 'vitest';
import { TraceReplayIterator } from '../../src/trace/replay.js';
import type { BoundaryDetector } from '../../src/core/types.js';
import path from 'node:path';

const fixturePath = path.resolve('test/fixtures/traces/sample.jsonl');

function mockDetector(): BoundaryDetector {
  return {
    analyze: vi.fn().mockResolvedValue(null),
  };
}

describe('TraceReplayIterator', () => {
  it('should load and count events from JSONL', async () => {
    const iterator = new TraceReplayIterator('/project', mockDetector());
    await iterator.load(fixturePath);
    expect(iterator.eventCount()).toBeGreaterThan(0);
    expect(iterator.eventIndex()).toBe(0);
    expect(iterator.isComplete()).toBe(false);
  });

  it('should process events one at a time via next()', async () => {
    const iterator = new TraceReplayIterator('/project', mockDetector());
    await iterator.load(fixturePath);
    const result = await iterator.next();
    expect(result.event).toBeDefined();
    expect(result.entry).toBeDefined();
    expect(iterator.eventIndex()).toBe(1);
  });

  it('should process all events via runAll()', async () => {
    const iterator = new TraceReplayIterator('/project', mockDetector());
    await iterator.load(fixturePath);
    const result = await iterator.runAll(10000);
    expect(result.frames.length).toBeGreaterThan(0);
    expect(result.resolutions.length).toBeGreaterThan(0);
    expect(result.timeline).toBeDefined();
    expect(iterator.isComplete()).toBe(true);
  });

  it('should record side effects for Edit tool calls', async () => {
    const iterator2 = new TraceReplayIterator('/project', mockDetector());
    await iterator2.load(fixturePath);
    const sideEffectSteps = [];
    while (!iterator2.isComplete()) {
      const step = await iterator2.next();
      if (step.sideEffectsRecorded.length > 0) {
        sideEffectSteps.push(step);
      }
    }
    expect(sideEffectSteps.length).toBeGreaterThan(0);
  });

  it('should resolve at resolution points (after user messages and tool results)', async () => {
    const iterator = new TraceReplayIterator('/project', mockDetector());
    await iterator.load(fixturePath);
    const result = await iterator.runAll(10000);
    expect(result.resolutions.length).toBeGreaterThanOrEqual(2);
  });
});
