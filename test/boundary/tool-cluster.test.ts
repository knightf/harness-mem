import { describe, it, expect } from 'vitest';
import { ToolClusterDetector } from '../../src/boundary/tool-cluster.js';
import { createDecayPolicy } from '../../src/decay/policies.js';
import type { ContextEntry, ContextFrame } from '../../src/core/types.js';

function makeToolEntry(toolName: string, timestamp: number): ContextEntry {
  return {
    id: `e-${timestamp}`,
    type: 'conversational',
    content: null,
    createdAt: timestamp,
    decay: createDecayPolicy('none'),
    references: [],
    metadata: { toolName },
  };
}

function makeFrame(entries: ContextEntry[] = []): ContextFrame {
  return {
    id: 'f1', parentId: null, entries, captures: [],
    boundary: { type: 'explicit', description: 'root', confidence: 1 },
    status: 'active',
  };
}

describe('ToolClusterDetector', () => {
  it('should not fire boundary for same tool type', async () => {
    const detector = new ToolClusterDetector();
    const frame = makeFrame([
      makeToolEntry('Read', 1000),
      makeToolEntry('Read', 1100),
    ]);
    const newActivity = [makeToolEntry('Read', 1200)];
    const result = await detector.analyze(frame, newActivity);
    expect(result).toBeNull();
  });

  it('should fire boundary when tool type changes', async () => {
    const detector = new ToolClusterDetector();
    const frame = makeFrame([
      makeToolEntry('Read', 1000),
      makeToolEntry('Read', 1100),
    ]);
    const newActivity = [makeToolEntry('Edit', 1200)];
    const result = await detector.analyze(frame, newActivity);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('tool-cluster');
  });

  it('should fire boundary on long time gap', async () => {
    const detector = new ToolClusterDetector({ timeGapMs: 5000 });
    const frame = makeFrame([makeToolEntry('Read', 1000)]);
    const newActivity = [makeToolEntry('Read', 20000)];
    const result = await detector.analyze(frame, newActivity);
    expect(result).not.toBeNull();
  });

  it('should not fire for non-tool entries', async () => {
    const detector = new ToolClusterDetector();
    const frame = makeFrame();
    const userEntry: ContextEntry = {
      id: 'u1', type: 'conversational', content: 'hello',
      createdAt: 1000, decay: createDecayPolicy('none'), references: [], metadata: {},
    };
    const result = await detector.analyze(frame, [userEntry]);
    expect(result).toBeNull();
  });
});
