import { describe, it, expect } from 'vitest';
import {
  ScopeEngineImpl,
  TraceReplayIterator,
  TraceAdapter,
  ClaudeLLMProvider,
  HybridBoundaryDetector,
  ToolClusterDetector,
  SimpleTokenEstimator,
  createDecayPolicy,
} from '../src/index.js';

describe('Public API', () => {
  it('should export all main classes and functions', () => {
    expect(ScopeEngineImpl).toBeDefined();
    expect(TraceReplayIterator).toBeDefined();
    expect(TraceAdapter).toBeDefined();
    expect(ClaudeLLMProvider).toBeDefined();
    expect(HybridBoundaryDetector).toBeDefined();
    expect(ToolClusterDetector).toBeDefined();
    expect(SimpleTokenEstimator).toBeDefined();
    expect(createDecayPolicy).toBeDefined();
  });
});
