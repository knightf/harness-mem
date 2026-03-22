import { describe, it, expect, vi } from 'vitest';
import { HybridBoundaryDetector } from '../../src/boundary/hybrid.js';
import type { BoundaryDetector, BoundarySignal, ContextFrame, ContextEntry } from '../../src/core/types.js';

function makeFrame(): ContextFrame {
  return {
    id: 'f1', parentId: null, entries: [], captures: [],
    boundary: { type: 'explicit', description: 'root', confidence: 1 },
    status: 'active',
  };
}

function mockDetector(result: BoundarySignal | null): BoundaryDetector {
  return { analyze: vi.fn().mockResolvedValue(result) };
}

describe('HybridBoundaryDetector', () => {
  it('should return heuristic result when no user input and no semantic needed', async () => {
    const heuristic = mockDetector(null);
    const semantic = mockDetector(null);
    const hybrid = new HybridBoundaryDetector(heuristic, semantic);
    const result = await hybrid.analyze(makeFrame(), []);
    expect(result).toBeNull();
    expect(semantic.analyze).not.toHaveBeenCalled();
  });

  it('should invoke semantic when user input is present', async () => {
    const heuristic = mockDetector(null);
    const semanticSignal: BoundarySignal = { type: 'user-input', description: 'direction change', confidence: 0.9 };
    const semantic = mockDetector(semanticSignal);
    const hybrid = new HybridBoundaryDetector(heuristic, semantic);
    const userEntry: ContextEntry = {
      id: 'u1', type: 'conversational', content: 'new direction',
      createdAt: 1000, decay: { strategy: 'none' }, references: [],
      metadata: { eventType: 'user-message' },
    };
    const result = await hybrid.analyze(makeFrame(), [userEntry]);
    expect(semantic.analyze).toHaveBeenCalled();
    expect(result).toEqual(semanticSignal);
  });

  it('should let heuristic win for tool-cluster even when semantic disagrees', async () => {
    const heuristicSignal: BoundarySignal = { type: 'tool-cluster', description: 'cluster end', confidence: 0.8 };
    const heuristic = mockDetector(heuristicSignal);
    const semantic = mockDetector(null);
    const hybrid = new HybridBoundaryDetector(heuristic, semantic);
    const toolEntry: ContextEntry = {
      id: 't1', type: 'conversational', content: null,
      createdAt: 1000, decay: { strategy: 'none' }, references: [],
      metadata: { toolName: 'Edit', eventType: 'tool-call' },
    };
    const result = await hybrid.analyze(makeFrame(), [toolEntry]);
    expect(result).toEqual(heuristicSignal);
  });

  it('should fall back to heuristic when semantic throws', async () => {
    const heuristicSignal: BoundarySignal = { type: 'tool-cluster', description: 'cluster', confidence: 0.7 };
    const heuristic = mockDetector(heuristicSignal);
    const semantic: BoundaryDetector = {
      analyze: vi.fn().mockRejectedValue(new Error('LLM failed')),
    };
    const hybrid = new HybridBoundaryDetector(heuristic, semantic);
    const userEntry: ContextEntry = {
      id: 'u1', type: 'conversational', content: 'test',
      createdAt: 1000, decay: { strategy: 'none' }, references: [],
      metadata: { eventType: 'user-message' },
    };
    const result = await hybrid.analyze(makeFrame(), [userEntry]);
    expect(result).toEqual(heuristicSignal);
  });
});
