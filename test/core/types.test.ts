import { describe, it, expect } from 'vitest';
import type {
  ContextEntry,
  DecayPolicy,
  ContextFrame,
  BoundarySignal,
  SerializedEntry,
  Artifact,
  ArtifactSnapshot,
  ScopeEngineConfig,
  ResolvedContext,
  AccessLog,
  GCResult,
  RawTraceEntry,
  ContentBlock,
  TraceEvent,
  ReplayResult,
  TimelineEntry,
  StepResult,
  LLMProvider,
  TokenEstimator,
  BoundaryDetector,
  Compactor,
} from '../../src/core/types.js';

describe('Core Types', () => {
  it('should allow creating a ContextEntry', () => {
    const entry: ContextEntry = {
      id: 'entry-1',
      type: 'conversational',
      content: 'Hello world',
      createdAt: Date.now(),
      decay: { strategy: 'none' },
      references: [],
      metadata: {},
    };
    expect(entry.id).toBe('entry-1');
    expect(entry.type).toBe('conversational');
  });

  it('should allow creating a DecayPolicy with custom scorer', () => {
    const policy: DecayPolicy = {
      strategy: 'custom',
      customScorer: (age, accessCount) => Math.max(0, 1 - age / 1000),
    };
    expect(policy.customScorer!(100, 0)).toBeCloseTo(0.9);
  });

  it('should allow creating a ContextFrame', () => {
    const frame: ContextFrame = {
      id: 'frame-1',
      parentId: null,
      entries: [],
      captures: [],
      boundary: { type: 'explicit', description: 'root frame', confidence: 1 },
      status: 'active',
    };
    expect(frame.status).toBe('active');
    expect(frame.parentId).toBeNull();
  });

  it('should allow creating a SerializedEntry without functions', () => {
    const serialized: SerializedEntry = {
      id: 'entry-1',
      type: 'conversational',
      content: 'test',
      createdAt: 1000,
      decay: { strategy: 'linear', halfLife: 500 },
      references: [],
      metadata: {},
    };
    expect(serialized.decay.strategy).toBe('linear');
  });

  it('should allow creating an Artifact with snapshots', () => {
    const artifact: Artifact = {
      id: 'artifact-1',
      location: '/c/users/eric/file.ts',
      snapshots: [{ frameId: 'frame-1', timestamp: 1000, state: 'v1' }],
      currentState: 'v1',
    };
    expect(artifact.snapshots).toHaveLength(1);
  });

  it('should allow creating a TraceEvent', () => {
    const event: TraceEvent = {
      type: 'tool-call',
      timestamp: Date.now(),
      content: null,
      toolName: 'Read',
      toolParams: { file_path: '/test.ts' },
      sourceUuid: 'uuid-1',
      hasSideEffect: false,
    };
    expect(event.type).toBe('tool-call');
    expect(event.hasSideEffect).toBe(false);
  });

  it('should allow creating a ScopeEngineConfig with defaults', () => {
    const config: ScopeEngineConfig = {
      frameDepthLimit: 100,
    };
    expect(config.frameDepthLimit).toBe(100);
  });
});
