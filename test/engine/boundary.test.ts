import { describe, it, expect } from 'vitest';
import { ToolClusterDetector } from '../../src/engine/boundary.js';
import type { ContextEntry } from '../../src/engine/types.js';

function makeToolEntry(toolName: string, createdAt = Date.now()): ContextEntry {
  return {
    id: `e-${toolName}`,
    frameId: 'f1',
    type: 'conversational',
    content: `tool call: ${toolName}`,
    tokenEstimate: 10,
    createdAt,
    decayPolicy: { strategy: 'none' },
    metadata: { toolName },
    references: [],
  };
}

describe('ToolClusterDetector', () => {
  it('should detect boundary on tool type change', async () => {
    const detector = new ToolClusterDetector();
    const history = [makeToolEntry('Read'), makeToolEntry('Read')];
    const current = makeToolEntry('Edit');
    const signal = await detector.detect(current, history);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe('tool-cluster');
    expect(signal!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('should not detect boundary for same tool type', async () => {
    const detector = new ToolClusterDetector();
    const history = [makeToolEntry('Read')];
    const current = makeToolEntry('Read');
    const signal = await detector.detect(current, history);
    expect(signal).toBeNull();
  });

  it('should detect boundary on time gap', async () => {
    const detector = new ToolClusterDetector({ timeGapMs: 10000 });
    const history = [makeToolEntry('Read', Date.now() - 20000)];
    const current = makeToolEntry('Read', Date.now());
    const signal = await detector.detect(current, history);
    expect(signal).not.toBeNull();
  });

  it('should ignore non-tool entries', async () => {
    const detector = new ToolClusterDetector();
    const history = [makeToolEntry('Read')];
    const current: ContextEntry = {
      id: 'e-text', frameId: 'f1', type: 'conversational',
      content: 'just text', tokenEstimate: 10, createdAt: Date.now(),
      decayPolicy: { strategy: 'none' }, metadata: {}, references: [],
    };
    const signal = await detector.detect(current, history);
    expect(signal).toBeNull();
  });
});
