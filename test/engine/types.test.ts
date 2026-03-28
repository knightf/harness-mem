import { describe, it, expect } from 'vitest';
import type {
  ContextEntry,
  ContextFrame,
  BoundarySignal,
  DecayPolicy,
  Artifact,
  ArtifactSnapshot,
  TraceEvent,
  ResolvedContext,
  ScopeEngineConfig,
  ReplayResult,
  DigestMetadata,
  HarnessMemConfig,
} from '../../src/engine/types.js';

describe('Core Types', () => {
  it('should create a ContextEntry', () => {
    const entry: ContextEntry = {
      id: 'e1',
      frameId: 'f1',
      type: 'conversational',
      content: 'test content',
      tokenEstimate: 10,
      createdAt: Date.now(),
      decayPolicy: { strategy: 'none' },
      metadata: {},
      references: [],
    };
    expect(entry.id).toBe('e1');
    expect(entry.type).toBe('conversational');
  });

  it('should create a TraceEvent', () => {
    const event: TraceEvent = {
      id: 'ev1',
      type: 'user-message',
      content: 'hello',
      timestamp: Date.now(),
      tokenEstimate: 5,
    };
    expect(event.type).toBe('user-message');
  });

  it('should create a DigestMetadata', () => {
    const meta: DigestMetadata = {
      sessionId: 'abc123',
      timestamp: '2026-03-28T14:30:00Z',
      durationMinutes: 45,
      model: 'claude-haiku-4-5-20251001',
      workingDirectory: '/home/user/project',
    };
    expect(meta.sessionId).toBe('abc123');
  });

  it('should create a HarnessMemConfig', () => {
    const config: HarnessMemConfig = {
      digestDir: '~/.harness-mem/digests',
      transcriptDir: '~/.claude/projects',
      defaultModel: 'claude-haiku-4-5-20251001',
      defaultProvider: 'anthropic',
      recap: { since: '24h', maxLength: 20000, maxFallbackDigests: 10 },
      clean: { olderThan: '30d' },
    };
    expect(config.recap.maxLength).toBe(20000);
  });
});
