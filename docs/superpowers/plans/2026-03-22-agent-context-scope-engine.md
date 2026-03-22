# Agent Context Scope Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript library that manages agent context through JS-inspired scope chain semantics, validated by replaying real Claude Code traces.

**Architecture:** A scope engine processes events into context frames, uses hybrid boundary detection (heuristic + LLM) to discover step boundaries, applies decay-based GC to manage token budgets, and resolves scoped context on demand. A trace replay system feeds real Claude Code JSONL sessions through the engine for validation.

**Tech Stack:** TypeScript, Node.js, Vitest (testing), Anthropic SDK (LLM provider)

**Spec:** `docs/superpowers/specs/2026-03-22-agent-context-scope-engine-design.md`

---

## File Map

| File | Responsibility |
|---|---|
| `src/core/types.ts` | All interfaces and type definitions |
| `src/core/utils.ts` | Shared utilities: ID generation, `normalizePath`, `TokenEstimator` |
| `src/core/scope-engine.ts` | `ScopeEngine` implementation: frame stack, entry registry, orchestration |
| `src/core/scope-chain.ts` | Scope resolution: walk frame chain, apply tiers, fit budget |
| `src/boundary/detector.ts` | `BoundaryDetector` interface + `hasUserInput` helper |
| `src/boundary/tool-cluster.ts` | `ToolClusterDetector` heuristic implementation |
| `src/boundary/semantic.ts` | `SemanticBoundaryDetector` LLM-powered implementation |
| `src/boundary/hybrid.ts` | `HybridBoundaryDetector` composite + merge logic |
| `src/decay/policies.ts` | Built-in decay policies: none, linear, step |
| `src/decay/decay-engine.ts` | `DecayEngine`: scoring per dimension, access log |
| `src/decay/compactor.ts` | `Compactor`: LLM-powered entry summarization |
| `src/decay/gc.ts` | Garbage collector: retain/collect/compact + aggressive GC |
| `src/side-effects/store.ts` | `SideEffectStore`: artifact tracking, snapshots |
| `src/llm/provider.ts` | `LLMProvider` interface + Claude implementation |
| `src/trace/adapter.ts` | `TraceAdapter`: parse JSONL, decompose to `TraceEvent[]` |
| `src/trace/side-effect-detector.ts` | Detect side effects from tool calls, extract paths |
| `src/trace/replay.ts` | `TraceReplayIterator`: next/resolve/runAll |
| `src/index.ts` | Public API re-exports |
| `test/fixtures/traces/` | Sample Claude Code JSONL files |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Initialize package.json**

```bash
cd C:/Users/Eric/Repos/harness
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install typescript vitest @anthropic-ai/sdk uuid
npm install -D @types/node @types/uuid tsx
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globals: true,
  },
});
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
*.js.map
.env
```

- [ ] **Step 6: Add test script to package.json**

Add to `scripts`:
```json
{
  "build": "tsc",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 7: Create directory structure**

```bash
mkdir -p src/core src/boundary src/decay src/side-effects src/llm src/trace
mkdir -p test/fixtures/traces test/core test/boundary test/decay test/trace test/side-effects test/llm test/integration
```

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore
git commit -m "chore: scaffold project with TypeScript and Vitest"
```

---

## Task 2: Core Types

**Files:**
- Create: `src/core/types.ts`
- Test: `test/core/types.test.ts`

- [ ] **Step 1: Write type validation test**

```typescript
// test/core/types.test.ts
import { describe, it, expect } from 'vitest';
import type {
  ContextEntry,
  DecayPolicy,
  ContextFrame,
  BoundarySignal,
  SerializedEntry,
  Artifact,
  ArtifactSnapshot,
  SideEffectStore,
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
    // SerializedEntry should not have customScorer — this is a compile-time check
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/core/types.test.ts`
Expected: FAIL — cannot find module `../../src/core/types.js`

- [ ] **Step 3: Write all type definitions**

Create `src/core/types.ts` with all interfaces from the spec:
- `DecayPolicy`, `ContextEntry`, `ContextFrame`, `BoundarySignal`, `SerializedEntry`
- `Artifact`, `ArtifactSnapshot`, `SideEffectStore` (as type, not class)
- `ScopeEngineConfig`, `ResolvedContext`, `AccessLog`, `GCResult`
- `RawTraceEntry`, `ContentBlock`, `TraceEvent`, `ReplayResult`, `TimelineEntry`, `StepResult`
- `LLMProvider`, `TokenEstimator`
- `BoundaryDetector` interface

Include `Compactor` interface and `BoundaryDetector` interface. Copy interfaces exactly from the spec. Export all types.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/core/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts test/core/types.test.ts
git commit -m "feat: add all core type definitions"
```

---

## Task 3: Core Utilities

**Files:**
- Create: `src/core/utils.ts`
- Test: `test/core/utils.test.ts`

- [ ] **Step 1: Write tests for utilities**

```typescript
// test/core/utils.test.ts
import { describe, it, expect } from 'vitest';
import { generateId, normalizePath, SimpleTokenEstimator } from '../../src/core/utils.js';

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('should generate string IDs', () => {
    expect(typeof generateId()).toBe('string');
  });
});

describe('normalizePath', () => {
  it('should resolve relative paths to absolute', () => {
    const result = normalizePath('./src/file.ts', '/home/user/project');
    expect(result).toContain('src');
    expect(result).toContain('file.ts');
  });

  it('should lowercase the result', () => {
    const result = normalizePath('/Home/User/File.TS', '/');
    expect(result).toBe(result.toLowerCase());
  });

  it('should handle absolute paths', () => {
    const result = normalizePath('/absolute/path/file.ts', '/other');
    expect(result).toContain('absolute');
    expect(result).toContain('file.ts');
  });
});

describe('SimpleTokenEstimator', () => {
  it('should estimate tokens for a string', () => {
    const estimator = new SimpleTokenEstimator();
    const tokens = estimator.estimate('hello world');
    expect(tokens).toBeGreaterThan(0);
    expect(typeof tokens).toBe('number');
  });

  it('should estimate tokens for objects by JSON stringifying', () => {
    const estimator = new SimpleTokenEstimator();
    const tokens = estimator.estimate({ key: 'value', nested: { a: 1 } });
    expect(tokens).toBeGreaterThan(0);
  });

  it('should return 0 for null/undefined', () => {
    const estimator = new SimpleTokenEstimator();
    expect(estimator.estimate(null)).toBe(0);
    expect(estimator.estimate(undefined)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/core/utils.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement utilities**

```typescript
// src/core/utils.ts
import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import type { TokenEstimator } from './types.js';

export function generateId(): string {
  return uuidv4();
}

export function normalizePath(filePath: string, cwd: string): string {
  return path.resolve(cwd, filePath).toLowerCase();
}

export class SimpleTokenEstimator implements TokenEstimator {
  estimate(content: unknown): number {
    if (content === null || content === undefined) return 0;
    const str = typeof content === 'string' ? content : JSON.stringify(content);
    return Math.ceil(str.length / 4);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/core/utils.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/utils.ts test/core/utils.test.ts
git commit -m "feat: add core utilities (ID generation, path normalization, token estimation)"
```

---

## Task 4: SideEffectStore

**Files:**
- Create: `src/side-effects/store.ts`
- Test: `test/side-effects/store.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// test/side-effects/store.test.ts
import { describe, it, expect } from 'vitest';
import { SideEffectStoreImpl } from '../../src/side-effects/store.js';

describe('SideEffectStore', () => {
  it('should record a new artifact', () => {
    const store = new SideEffectStoreImpl('/project');
    store.record({
      id: 'a1',
      location: '/project/src/file.ts',
      snapshots: [],
      currentState: 'content v1',
    });
    const artifact = store.get('/project/src/file.ts');
    expect(artifact).not.toBeNull();
    expect(artifact!.currentState).toBe('content v1');
  });

  it('should normalize paths when recording and getting', () => {
    const store = new SideEffectStoreImpl('/project');
    store.record({
      id: 'a1',
      location: '/Project/Src/File.ts',
      snapshots: [],
      currentState: 'v1',
    });
    // Should find by differently-cased path
    const artifact = store.get('/project/src/file.ts');
    expect(artifact).not.toBeNull();
  });

  it('should update existing artifact and add snapshot', () => {
    const store = new SideEffectStoreImpl('/project');
    store.record({
      id: 'a1',
      location: '/project/file.ts',
      snapshots: [],
      currentState: 'v1',
    });
    store.update('/project/file.ts', 'v2', 'frame-2', 2000);
    const artifact = store.get('/project/file.ts');
    expect(artifact!.currentState).toBe('v2');
    expect(artifact!.snapshots).toHaveLength(1);
    expect(artifact!.snapshots[0].state).toBe('v1');
    expect(artifact!.snapshots[0].frameId).toBe('frame-2');
  });

  it('should return null for unknown artifacts', () => {
    const store = new SideEffectStoreImpl('/project');
    expect(store.get('/nonexistent')).toBeNull();
  });

  it('should list all artifacts', () => {
    const store = new SideEffectStoreImpl('/project');
    store.record({ id: 'a1', location: '/project/a.ts', snapshots: [], currentState: 'a' });
    store.record({ id: 'a2', location: '/project/b.ts', snapshots: [], currentState: 'b' });
    expect(store.all()).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/side-effects/store.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement SideEffectStoreImpl**

```typescript
// src/side-effects/store.ts
import type { Artifact, ArtifactSnapshot } from '../core/types.js';
import { normalizePath } from '../core/utils.js';

export class SideEffectStoreImpl {
  private artifacts = new Map<string, Artifact>();
  private cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  record(artifact: Artifact): void {
    const key = normalizePath(artifact.location, this.cwd);
    this.artifacts.set(key, { ...artifact, location: key });
  }

  get(location: string): Artifact | null {
    const key = normalizePath(location, this.cwd);
    return this.artifacts.get(key) ?? null;
  }

  update(location: string, newState: unknown, frameId: string, timestamp: number): void {
    const key = normalizePath(location, this.cwd);
    const existing = this.artifacts.get(key);
    if (!existing) return;

    const snapshot: ArtifactSnapshot = {
      frameId,
      timestamp,
      state: existing.currentState,
    };
    existing.snapshots.push(snapshot);
    existing.currentState = newState;
  }

  all(): Artifact[] {
    return Array.from(this.artifacts.values());
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/side-effects/store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/side-effects/store.ts test/side-effects/store.test.ts
git commit -m "feat: implement SideEffectStore with path normalization"
```

---

## Task 5: Decay Policies & DecayEngine

**Files:**
- Create: `src/decay/policies.ts`
- Create: `src/decay/decay-engine.ts`
- Test: `test/decay/decay-engine.test.ts`

- [ ] **Step 1: Write tests for decay scoring**

```typescript
// test/decay/decay-engine.test.ts
import { describe, it, expect } from 'vitest';
import { DecayEngineImpl } from '../../src/decay/decay-engine.js';
import { createDecayPolicy } from '../../src/decay/policies.js';
import type { ContextEntry, AccessLog } from '../../src/core/types.js';

function makeEntry(overrides: Partial<ContextEntry> = {}): ContextEntry {
  return {
    id: 'e1',
    type: 'conversational',
    content: 'test',
    createdAt: 0,
    decay: createDecayPolicy('none'),
    references: [],
    metadata: {},
    ...overrides,
  };
}

function makeAccessLog(overrides: Partial<AccessLog> = {}): AccessLog {
  return {
    lastAccessed: new Map(),
    accessCount: new Map(),
    ...overrides,
  };
}

describe('DecayEngine', () => {
  const engine = new DecayEngineImpl();

  describe('scoring', () => {
    it('should return 1.0 for entries with no decay', () => {
      const entry = makeEntry({ decay: createDecayPolicy('none') });
      expect(engine.score(entry, 10000, makeAccessLog())).toBe(1.0);
    });

    it('should decay linearly based on age and halfLife', () => {
      const entry = makeEntry({
        createdAt: 0,
        decay: createDecayPolicy('linear', { halfLife: 1000 }),
      });
      const score = engine.score(entry, 1000, makeAccessLog());
      expect(score).toBeCloseTo(0.5, 1);
    });

    it('should return 0 for very old linear decay entries', () => {
      const entry = makeEntry({
        createdAt: 0,
        decay: createDecayPolicy('linear', { halfLife: 100 }),
      });
      const score = engine.score(entry, 100000, makeAccessLog());
      expect(score).toBeCloseTo(0, 1);
    });

    it('should boost score for frequently accessed entries', () => {
      const entry = makeEntry({
        createdAt: 0,
        decay: createDecayPolicy('linear', { halfLife: 1000 }),
      });
      const accessLog = makeAccessLog({
        accessCount: new Map([['e1', 10]]),
        lastAccessed: new Map([['e1', 900]]),
      });
      const scoreWithAccess = engine.score(entry, 1000, accessLog);
      const scoreWithout = engine.score(entry, 1000, makeAccessLog());
      expect(scoreWithAccess).toBeGreaterThan(scoreWithout);
    });

    it('should use custom scorer when strategy is custom', () => {
      const entry = makeEntry({
        decay: createDecayPolicy('custom', {
          customScorer: (age, count) => age > 500 ? 0 : 1,
        }),
      });
      expect(engine.score(entry, 400, makeAccessLog())).toBe(1);
      expect(engine.score(entry, 600, makeAccessLog())).toBe(0);
    });

    it('should apply accelerated decay for abandoned frame entries', () => {
      const entry = makeEntry({
        createdAt: 0,
        decay: createDecayPolicy('linear', { halfLife: 1000 }),
        metadata: { frameStatus: 'abandoned' },
      });
      const normalEntry = makeEntry({
        createdAt: 0,
        decay: createDecayPolicy('linear', { halfLife: 1000 }),
      });
      const abandonedScore = engine.score(entry, 500, makeAccessLog());
      const normalScore = engine.score(normalEntry, 500, makeAccessLog());
      expect(abandonedScore).toBeLessThan(normalScore);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/decay/decay-engine.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement decay policies**

```typescript
// src/decay/policies.ts
import type { DecayPolicy } from '../core/types.js';

export function createDecayPolicy(
  strategy: DecayPolicy['strategy'],
  options: {
    halfLife?: number;
    retainUntil?: string;
    customScorer?: (age: number, accessCount: number) => number;
  } = {}
): DecayPolicy {
  return {
    strategy,
    halfLife: options.halfLife,
    retainUntil: options.retainUntil,
    customScorer: options.customScorer,
  };
}
```

- [ ] **Step 4: Implement DecayEngine**

```typescript
// src/decay/decay-engine.ts
import type { ContextEntry, AccessLog } from '../core/types.js';

export class DecayEngineImpl {
  score(entry: ContextEntry, now: number, accessLog: AccessLog): number {
    const age = now - entry.createdAt;
    const accessCount = accessLog.accessCount.get(entry.id) ?? 0;
    const { decay } = entry;

    let baseScore: number;

    switch (decay.strategy) {
      case 'none':
        baseScore = 1.0;
        break;
      case 'linear': {
        const halfLife = decay.halfLife ?? 1000;
        baseScore = Math.pow(0.5, age / halfLife);
        break;
      }
      case 'step':
        // Step decay: full score until condition, then 0
        // For now, use halfLife as the step threshold
        baseScore = age < (decay.halfLife ?? Infinity) ? 1.0 : 0.0;
        break;
      case 'custom':
        baseScore = decay.customScorer ? decay.customScorer(age, accessCount) : 1.0;
        break;
      default:
        baseScore = 1.0;
    }

    // Access boost: recent and frequent access increases score
    if (accessCount > 0 && decay.strategy !== 'custom') {
      const lastAccessed = accessLog.lastAccessed.get(entry.id) ?? entry.createdAt;
      const recency = Math.pow(0.5, (now - lastAccessed) / (decay.halfLife ?? 1000));
      const frequencyBoost = Math.min(accessCount * 0.05, 0.3);
      baseScore = Math.min(1.0, baseScore + recency * frequencyBoost);
    }

    // Accelerated decay for abandoned frame entries
    if (entry.metadata.frameStatus === 'abandoned') {
      baseScore *= 0.5;
    }

    return Math.max(0, Math.min(1, baseScore));
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/decay/decay-engine.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/decay/policies.ts src/decay/decay-engine.ts test/decay/decay-engine.test.ts
git commit -m "feat: implement decay policies and DecayEngine scoring"
```

---

## Task 6: Scope Chain Resolution

**Files:**
- Create: `src/core/scope-chain.ts`
- Test: `test/core/scope-chain.test.ts`

- [ ] **Step 1: Write tests for scope chain resolution**

```typescript
// test/core/scope-chain.test.ts
import { describe, it, expect } from 'vitest';
import { ScopeChain } from '../../src/core/scope-chain.js';
import { DecayEngineImpl } from '../../src/decay/decay-engine.js';
import { SimpleTokenEstimator } from '../../src/core/utils.js';
import { createDecayPolicy } from '../../src/decay/policies.js';
import type { ContextFrame, ContextEntry, AccessLog } from '../../src/core/types.js';

function makeFrame(id: string, parentId: string | null, entries: ContextEntry[], captures: string[] = []): ContextFrame {
  return {
    id,
    parentId,
    entries,
    captures,
    boundary: { type: 'explicit', description: 'test', confidence: 1 },
    status: 'completed' as const,
  };
}

function makeEntry(id: string, content: string, type: ContextEntry['type'] = 'conversational'): ContextEntry {
  return {
    id,
    type,
    content,
    createdAt: Date.now(),
    decay: createDecayPolicy('none'),
    references: [],
    metadata: {},
  };
}

describe('ScopeChain', () => {
  const decayEngine = new DecayEngineImpl();
  const tokenEstimator = new SimpleTokenEstimator();

  it('should resolve entries from current frame as Tier 1', () => {
    const entry = makeEntry('e1', 'current frame content');
    const frame = makeFrame('f1', null, [entry]);
    const chain = new ScopeChain(decayEngine, tokenEstimator);
    const result = chain.resolve(
      frame,
      new Map([['f1', frame]]),
      new Map([['e1', entry]]),
      [],
      { lastAccessed: new Map(), accessCount: new Map() },
      10000
    );
    expect(result.entries).toContainEqual(expect.objectContaining({ id: 'e1' }));
  });

  it('should resolve captured entries from parent as Tier 2', () => {
    const parentEntry = makeEntry('pe1', 'parent content');
    const parentFrame = makeFrame('f1', null, [parentEntry]);
    const childFrame = makeFrame('f2', 'f1', [], ['pe1']);
    const frames = new Map([['f1', parentFrame], ['f2', childFrame]]);
    const entries = new Map([['pe1', parentEntry]]);
    const chain = new ScopeChain(decayEngine, tokenEstimator);
    const result = chain.resolve(childFrame, frames, entries, [], { lastAccessed: new Map(), accessCount: new Map() }, 10000);
    expect(result.entries).toContainEqual(expect.objectContaining({ id: 'pe1' }));
  });

  it('should include uncaptured parent entries as Tier 3', () => {
    const parentEntry = makeEntry('pe1', 'parent content');
    const parentFrame = makeFrame('f1', null, [parentEntry]);
    const childFrame = makeFrame('f2', 'f1', []);
    childFrame.status = 'active';
    const frames = new Map([['f1', parentFrame], ['f2', childFrame]]);
    const entries = new Map([['pe1', parentEntry]]);
    const chain = new ScopeChain(decayEngine, tokenEstimator);
    const result = chain.resolve(childFrame, frames, entries, [], { lastAccessed: new Map(), accessCount: new Map() }, 10000);
    expect(result.entries).toContainEqual(expect.objectContaining({ id: 'pe1' }));
  });

  it('should respect token budget and drop lowest-scored entries', () => {
    const entries: ContextEntry[] = [];
    for (let i = 0; i < 100; i++) {
      entries.push(makeEntry(`e${i}`, 'x'.repeat(100)));
    }
    const frame = makeFrame('f1', null, entries);
    const entryMap = new Map(entries.map(e => [e.id, e]));
    const chain = new ScopeChain(decayEngine, tokenEstimator);
    // Very small budget — should drop most entries
    const result = chain.resolve(frame, new Map([['f1', frame]]), entryMap, [], { lastAccessed: new Map(), accessCount: new Map() }, 500);
    expect(result.entries.length).toBeLessThan(100);
    expect(result.dropped.length).toBeGreaterThan(0);
    expect(result.totalTokens).toBeLessThanOrEqual(result.budget);
  });

  it('should prioritize Tier 1 over Tier 3 when budget is tight', () => {
    const parentEntry = makeEntry('pe1', 'x'.repeat(200));
    const currentEntry = makeEntry('ce1', 'x'.repeat(200));
    const parentFrame = makeFrame('f1', null, [parentEntry]);
    const childFrame = makeFrame('f2', 'f1', [currentEntry]);
    childFrame.status = 'active';
    const frames = new Map([['f1', parentFrame], ['f2', childFrame]]);
    const entries = new Map([['pe1', parentEntry], ['ce1', currentEntry]]);
    const chain = new ScopeChain(decayEngine, tokenEstimator);
    // Budget for roughly one entry
    const result = chain.resolve(childFrame, frames, entries, [], { lastAccessed: new Map(), accessCount: new Map() }, 60);
    const ids = result.entries.map(e => e.id);
    expect(ids).toContain('ce1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/core/scope-chain.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement ScopeChain**

Implement `src/core/scope-chain.ts`:
- `resolve()` method walks parent chain, assigns tiers, applies decay scoring, fits budget
- Tier 1: current frame entries (score boosted to ensure priority)
- Tier 2: captured entries from parents (moderate boost)
- Tier 3: uncaptured parent entries, side effects, cross-session
- Sort by effective score (tier boost + decay score), fit within budget by dropping from bottom

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/core/scope-chain.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/scope-chain.ts test/core/scope-chain.test.ts
git commit -m "feat: implement scope chain resolution with three-tier priority"
```

---

## Task 7: Scope Engine

**Files:**
- Create: `src/core/scope-engine.ts`
- Test: `test/core/scope-engine.test.ts`

- [ ] **Step 1: Write tests for scope engine**

```typescript
// test/core/scope-engine.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/core/scope-engine.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement ScopeEngineImpl**

Implement `src/core/scope-engine.ts`:
- Constructor takes `ScopeEngineConfig` and `cwd`, creates root frame
- Frame stack management: `pushFrame`, `popFrame`, `abandonFrame`
- Entry registry: `Map<string, ContextEntry>` with `addEntry`, `getEntry`
- Delegates to `ScopeChain` for `resolve()`
- Delegates to `SideEffectStoreImpl` for side effects
- `loadCrossSessionEntries()` stub: stores entries in a separate list, passed to scope chain
- `gc()`: placeholder for Task 9

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/core/scope-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/scope-engine.ts test/core/scope-engine.test.ts
git commit -m "feat: implement ScopeEngine with frame management and resolution"
```

---

## Task 8: Boundary Detectors

**Files:**
- Create: `src/boundary/detector.ts`
- Create: `src/boundary/tool-cluster.ts`
- Create: `src/boundary/semantic.ts`
- Create: `src/boundary/hybrid.ts`
- Test: `test/boundary/tool-cluster.test.ts`
- Test: `test/boundary/hybrid.test.ts`

- [ ] **Step 1: Write tests for ToolClusterDetector**

```typescript
// test/boundary/tool-cluster.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/boundary/tool-cluster.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement detector interface and helpers**

```typescript
// src/boundary/detector.ts
import type { BoundaryDetector, ContextEntry } from '../core/types.js';

export type { BoundaryDetector };

export function hasUserInput(entries: ContextEntry[]): boolean {
  return entries.some(e => e.metadata.eventType === 'user-message');
}
```

- [ ] **Step 4: Implement ToolClusterDetector**

```typescript
// src/boundary/tool-cluster.ts
import type { BoundaryDetector, BoundarySignal, ContextFrame, ContextEntry } from '../core/types.js';

interface ToolClusterConfig {
  timeGapMs?: number;  // default 10000
}

export class ToolClusterDetector implements BoundaryDetector {
  private timeGapMs: number;

  constructor(config: ToolClusterConfig = {}) {
    this.timeGapMs = config.timeGapMs ?? 10000;
  }

  async analyze(currentFrame: ContextFrame, newActivity: ContextEntry[]): Promise<BoundarySignal | null> {
    const newToolEntries = newActivity.filter(e => e.metadata.toolName);
    if (newToolEntries.length === 0) return null;

    const lastFrameToolEntries = currentFrame.entries.filter(e => e.metadata.toolName);
    if (lastFrameToolEntries.length === 0) return null;

    const lastTool = lastFrameToolEntries[lastFrameToolEntries.length - 1];
    const newTool = newToolEntries[0];

    // Different tool type → boundary
    if (lastTool.metadata.toolName !== newTool.metadata.toolName) {
      return {
        type: 'tool-cluster',
        description: `Tool changed from ${lastTool.metadata.toolName} to ${newTool.metadata.toolName}`,
        confidence: 0.8,
      };
    }

    // Long time gap → boundary
    if (newTool.createdAt - lastTool.createdAt > this.timeGapMs) {
      return {
        type: 'tool-cluster',
        description: `Time gap of ${newTool.createdAt - lastTool.createdAt}ms between ${lastTool.metadata.toolName} calls`,
        confidence: 0.6,
      };
    }

    return null;
  }
}
```

- [ ] **Step 5: Run ToolCluster test to verify it passes**

Run: `npx vitest run test/boundary/tool-cluster.test.ts`
Expected: PASS

- [ ] **Step 6: Write tests for HybridBoundaryDetector**

```typescript
// test/boundary/hybrid.test.ts
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
    const semantic = mockDetector(null); // semantic says no boundary
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
```

- [ ] **Step 7: Implement SemanticBoundaryDetector**

Create `src/boundary/semantic.ts`:
- Takes `LLMProvider` in constructor
- Builds a minimal prompt: current frame's boundary description + new activity summary
- Asks LLM to classify: continuation, user-input boundary, or goal-shift
- Parses response into `BoundarySignal` or `null`

- [ ] **Step 8: Implement HybridBoundaryDetector**

Create `src/boundary/hybrid.ts`:
- Takes heuristic and semantic detectors in constructor
- Runs heuristic first
- Runs semantic when `hasUserInput(newActivity)` or heuristic fired
- Merge logic: type-specific precedence, then confidence tiebreak
- Wraps semantic call in try/catch for graceful degradation

- [ ] **Step 9: Run all boundary tests**

Run: `npx vitest run test/boundary/`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/boundary/ test/boundary/
git commit -m "feat: implement boundary detectors (heuristic, semantic, hybrid)"
```

---

## Task 9: Garbage Collector & Compactor

**Files:**
- Create: `src/decay/gc.ts`
- Create: `src/decay/compactor.ts`
- Test: `test/decay/gc.test.ts`

- [ ] **Step 1: Write tests for GC**

```typescript
// test/decay/gc.test.ts
import { describe, it, expect, vi } from 'vitest';
import { GarbageCollector } from '../../src/decay/gc.js';
import { DecayEngineImpl } from '../../src/decay/decay-engine.js';
import { SimpleTokenEstimator } from '../../src/core/utils.js';
import { createDecayPolicy } from '../../src/decay/policies.js';
import type { ContextEntry, Compactor } from '../../src/core/types.js';

function makeEntry(id: string, age: number, halfLife: number): ContextEntry {
  return {
    id, type: 'conversational', content: `content-${id}`,
    createdAt: 0, decay: createDecayPolicy('linear', { halfLife }),
    references: [], metadata: {},
  };
}

describe('GarbageCollector', () => {
  it('should retain high-scoring entries', () => {
    const gc = new GarbageCollector(new DecayEngineImpl(), new SimpleTokenEstimator());
    const entries = [makeEntry('e1', 0, 100000)]; // very slow decay
    const result = gc.classify(entries, 100, { lastAccessed: new Map(), accessCount: new Map() });
    expect(result.retained).toHaveLength(1);
    expect(result.collected).toHaveLength(0);
  });

  it('should collect very low-scoring entries', () => {
    const gc = new GarbageCollector(new DecayEngineImpl(), new SimpleTokenEstimator());
    const entries = [makeEntry('e1', 0, 1)]; // extremely fast decay
    const result = gc.classify(entries, 1000000, { lastAccessed: new Map(), accessCount: new Map() });
    expect(result.collected).toHaveLength(1);
  });

  it('should mark mid-range entries for compaction', () => {
    const gc = new GarbageCollector(new DecayEngineImpl(), new SimpleTokenEstimator());
    const entries = [
      makeEntry('high', 0, 100000),  // high score
      makeEntry('mid', 0, 500),      // mid score
      makeEntry('low', 0, 1),        // low score
    ];
    const result = gc.classify(entries, 1000000, { lastAccessed: new Map(), accessCount: new Map() });
    // At least one should be marked for compaction (mid-range)
    expect(result.retained.length + result.compacted.length + result.collected.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/decay/gc.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Compactor**

```typescript
// src/decay/compactor.ts
import type { Compactor, ContextEntry, LLMProvider } from '../core/types.js';
import { generateId } from '../core/utils.js';
import { createDecayPolicy } from './policies.js';

export class LLMCompactor implements Compactor {
  constructor(private llm: LLMProvider) {}

  async compact(entries: ContextEntry[]): Promise<ContextEntry> {
    const summaryPrompt = `Summarize the following context entries into a single concise paragraph that preserves the essential information:\n\n${entries.map(e => `- ${JSON.stringify(e.content)}`).join('\n')}`;
    const summary = await this.llm.complete(summaryPrompt, { maxTokens: 200 });
    const maxCreatedAt = Math.max(...entries.map(e => e.createdAt));

    return {
      id: generateId(),
      type: entries[0].type,
      content: summary,
      createdAt: maxCreatedAt,
      decay: createDecayPolicy('linear', { halfLife: 5000 }),
      references: entries.flatMap(e => e.references),
      metadata: { compactedFrom: entries.map(e => e.id) },
    };
  }
}
```

- [ ] **Step 4: Implement GarbageCollector**

```typescript
// src/decay/gc.ts
import type { ContextEntry, AccessLog, GCResult } from '../core/types.js';
import type { DecayEngineImpl } from './decay-engine.js';
import type { TokenEstimator } from '../core/types.js';

export class GarbageCollector {
  private retainThreshold = 0.4;
  private collectThreshold = 0.1;

  constructor(
    private decayEngine: DecayEngineImpl,
    private tokenEstimator: TokenEstimator
  ) {}

  classify(entries: ContextEntry[], now: number, accessLog: AccessLog): GCResult {
    const retained: ContextEntry[] = [];
    const compacted: ContextEntry[] = [];
    const collected: ContextEntry[] = [];

    for (const entry of entries) {
      const score = this.decayEngine.score(entry, now, accessLog);
      if (score >= this.retainThreshold) {
        retained.push(entry);
      } else if (score >= this.collectThreshold) {
        compacted.push(entry);
      } else {
        collected.push(entry);
      }
    }

    return { retained, compacted, collected };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/decay/gc.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/decay/gc.ts src/decay/compactor.ts test/decay/gc.test.ts
git commit -m "feat: implement garbage collector and LLM compactor"
```

- [ ] **Step 7: Wire GarbageCollector into ScopeEngine**

Update `src/core/scope-engine.ts` to instantiate a `GarbageCollector` and implement the `gc()` method (previously stubbed in Task 7). The `gc()` method should classify all entries across all frames, remove collected entries, and queue compacted entries for LLM summarization.

- [ ] **Step 8: Commit wiring**

```bash
git add src/core/scope-engine.ts
git commit -m "feat: wire GarbageCollector into ScopeEngine.gc()"
```

---

## Task 10: LLM Provider

**Files:**
- Create: `src/llm/provider.ts`
- Test: `test/llm/provider.test.ts`

- [ ] **Step 1: Write test for Claude provider**

```typescript
// test/llm/provider.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ClaudeLLMProvider } from '../../src/llm/provider.js';

describe('ClaudeLLMProvider', () => {
  it('should implement LLMProvider interface', () => {
    // Just verify construction works — actual API calls tested via integration
    const provider = new ClaudeLLMProvider('test-api-key', 'claude-haiku-4-5-20251001');
    expect(provider).toBeDefined();
    expect(typeof provider.complete).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/llm/provider.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement ClaudeLLMProvider**

```typescript
// src/llm/provider.ts
import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider } from '../core/types.js';

export class ClaudeLLMProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = 'claude-haiku-4-5-20251001') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature ?? 0,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock ? textBlock.text : '';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/llm/provider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/llm/provider.ts test/llm/provider.test.ts
git commit -m "feat: implement Claude LLM provider"
```

---

## Task 11: Trace Adapter

**Files:**
- Create: `src/trace/adapter.ts`
- Create: `src/trace/side-effect-detector.ts`
- Test: `test/trace/adapter.test.ts`

- [ ] **Step 1: Create a test fixture**

Create `test/fixtures/traces/sample.jsonl` with a small representative trace:

```jsonl
{"type":"user","parentUuid":null,"uuid":"u1","timestamp":"2026-03-22T10:00:00.000Z","sessionId":"s1","message":{"role":"user","content":"Read the file src/index.ts"}}
{"type":"assistant","parentUuid":"u1","uuid":"a1","timestamp":"2026-03-22T10:00:05.000Z","sessionId":"s1","message":{"role":"assistant","content":[{"type":"text","text":"Let me read that file."},{"type":"tool_use","id":"tu1","name":"Read","input":{"file_path":"/project/src/index.ts"}}]}}
{"type":"tool_result","parentUuid":"a1","uuid":"tr1","timestamp":"2026-03-22T10:00:06.000Z","sessionId":"s1","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu1","content":"export const hello = 'world';"}]}}
{"type":"assistant","parentUuid":"tr1","uuid":"a2","timestamp":"2026-03-22T10:00:10.000Z","sessionId":"s1","message":{"role":"assistant","content":[{"type":"text","text":"I can see the file. Let me edit it."},{"type":"tool_use","id":"tu2","name":"Edit","input":{"file_path":"/project/src/index.ts","old_string":"hello","new_string":"greeting"}}]}}
{"type":"tool_result","parentUuid":"a2","uuid":"tr2","timestamp":"2026-03-22T10:00:11.000Z","sessionId":"s1","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu2","content":"File edited successfully"}]}}
```

- [ ] **Step 2: Write tests for adapter**

```typescript
// test/trace/adapter.test.ts
import { describe, it, expect } from 'vitest';
import { TraceAdapter } from '../../src/trace/adapter.js';
import path from 'node:path';

const fixturePath = path.resolve('test/fixtures/traces/sample.jsonl');

describe('TraceAdapter', () => {
  it('should parse JSONL into RawTraceEntries', async () => {
    const adapter = new TraceAdapter('/project');
    const raw = await adapter.parseRaw(fixturePath);
    expect(raw).toHaveLength(5);
    expect(raw[0].type).toBe('user');
  });

  it('should decompose raw entries into TraceEvents', async () => {
    const adapter = new TraceAdapter('/project');
    const events = await adapter.decompose(fixturePath);
    // user(1) + assistant text(1) + tool_use(1) + tool_result(1) + assistant text(1) + tool_use(1) + tool_result(1) = 7
    expect(events.length).toBeGreaterThanOrEqual(7);
  });

  it('should decompose assistant messages into multiple events', async () => {
    const adapter = new TraceAdapter('/project');
    const events = await adapter.decompose(fixturePath);
    const textEvents = events.filter(e => e.type === 'assistant-text');
    const toolCallEvents = events.filter(e => e.type === 'tool-call');
    expect(textEvents.length).toBeGreaterThanOrEqual(2);
    expect(toolCallEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('should detect side effects on Edit tool calls', async () => {
    const adapter = new TraceAdapter('/project');
    const events = await adapter.decompose(fixturePath);
    const editCall = events.find(e => e.type === 'tool-call' && e.toolName === 'Edit');
    expect(editCall).toBeDefined();
    expect(editCall!.hasSideEffect).toBe(true);
    // normalizePath resolves relative to cwd then lowercases
    const expectedPath = path.resolve('/project', '/project/src/index.ts').toLowerCase();
    expect(editCall!.sideEffectPaths!.length).toBeGreaterThan(0);
    // Path should contain the file name regardless of platform-specific absolute prefix
    expect(editCall!.sideEffectPaths![0]).toContain('index.ts');
  });

  it('should not mark Read as side effect', async () => {
    const adapter = new TraceAdapter('/project');
    const events = await adapter.decompose(fixturePath);
    const readCall = events.find(e => e.type === 'tool-call' && e.toolName === 'Read');
    expect(readCall).toBeDefined();
    expect(readCall!.hasSideEffect).toBeFalsy();
  });

  it('should preserve sourceUuid linking back to raw entry', async () => {
    const adapter = new TraceAdapter('/project');
    const events = await adapter.decompose(fixturePath);
    expect(events.every(e => typeof e.sourceUuid === 'string')).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/trace/adapter.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement side effect detector**

```typescript
// src/trace/side-effect-detector.ts
import { normalizePath } from '../core/utils.js';

const SIDE_EFFECT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);
const NO_SIDE_EFFECT_TOOLS = new Set(['Read', 'Glob', 'Grep']);

const BASH_SIDE_EFFECT_PATTERNS = /\b(mkdir|rm|mv|cp|git\s+(add|commit|push|checkout|reset)|>\s*\S)/i;

export function detectSideEffect(
  toolName: string,
  toolParams: unknown,
  cwd: string
): { hasSideEffect: boolean; paths: string[] } {
  if (NO_SIDE_EFFECT_TOOLS.has(toolName)) {
    return { hasSideEffect: false, paths: [] };
  }

  if (SIDE_EFFECT_TOOLS.has(toolName)) {
    const params = toolParams as Record<string, unknown>;
    const filePath = params?.file_path as string | undefined;
    return {
      hasSideEffect: true,
      paths: filePath ? [normalizePath(filePath, cwd)] : [],
    };
  }

  if (toolName === 'Bash') {
    const params = toolParams as Record<string, unknown>;
    const command = params?.command as string | undefined;
    if (command && BASH_SIDE_EFFECT_PATTERNS.test(command)) {
      return { hasSideEffect: true, paths: [] }; // path extraction from bash is best-effort
    }
    return { hasSideEffect: false, paths: [] };
  }

  return { hasSideEffect: false, paths: [] };
}
```

- [ ] **Step 5: Implement TraceAdapter**

Create `src/trace/adapter.ts`:
- `parseRaw(jsonlPath)`: read file line by line, parse each line as JSON into `RawTraceEntry[]`
- `decompose(jsonlPath)`: parse raw, then for each raw entry:
  - `user` → emit one `user-message` TraceEvent
  - `assistant` → iterate `content` blocks, emit `assistant-text` for text blocks, `tool-call` for tool_use blocks
  - `tool_result` → emit one `tool-result` TraceEvent
  - `progress` → skip or emit `system-reminder`
- For tool-call events, run `detectSideEffect()` to set `hasSideEffect` and `sideEffectPaths`
- Parse `timestamp` strings to epoch numbers

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run test/trace/adapter.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/trace/adapter.ts src/trace/side-effect-detector.ts test/trace/adapter.test.ts test/fixtures/traces/sample.jsonl
git commit -m "feat: implement trace adapter with JSONL decomposition and side effect detection"
```

---

## Task 12: Trace Replay Iterator

**Files:**
- Create: `src/trace/replay.ts`
- Test: `test/trace/replay.test.ts`

- [ ] **Step 1: Write tests for replay iterator**

```typescript
// test/trace/replay.test.ts
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
    const iterator = new TraceReplayIterator('/project', mockDetector());
    await iterator.load(fixturePath);
    const result = await iterator.runAll(10000);
    // Should have recorded the Edit side effect
    const sideEffectSteps = [];
    // Replay all and check for recorded artifacts
    const iterator2 = new TraceReplayIterator('/project', mockDetector());
    await iterator2.load(fixturePath);
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
    // Should have multiple resolution snapshots
    expect(result.resolutions.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/trace/replay.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement TraceReplayIterator**

Create `src/trace/replay.ts`:
- Constructor takes `cwd`, `BoundaryDetector`, optional `ScopeEngineConfig`
- `load()`: uses `TraceAdapter.decompose()` to get ordered `TraceEvent[]`
- `next()`:
  1. Get next TraceEvent
  2. Create ContextEntry from it (map type, set metadata with eventType/toolName)
  3. If `hasSideEffect`, record in engine's SideEffectStore
  4. Run boundary detector
  5. If boundary detected, pop current frame, push new frame
  6. Add entry to current frame
  7. Return `StepResult`
- `resolve(budget)`: delegates to engine's `resolve()`
- `runAll(budget)`:
  1. Process all events via `next()`
  2. After each `user-message` or `tool-result` event, call `resolve(budget)` and record snapshot
  3. Record `TimelineEntry` at each boundary detection
  4. Return `ReplayResult`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/trace/replay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/trace/replay.ts test/trace/replay.test.ts
git commit -m "feat: implement trace replay iterator with resolution points"
```

---

## Task 13: Public API & Index

**Files:**
- Create: `src/index.ts`
- Test: `test/index.test.ts`

- [ ] **Step 1: Write smoke test**

```typescript
// test/index.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/index.test.ts`
Expected: FAIL

- [ ] **Step 3: Create index.ts with re-exports**

```typescript
// src/index.ts
export type * from './core/types.js';
export { ScopeEngineImpl } from './core/scope-engine.js';
export { ScopeChain } from './core/scope-chain.js';
export { generateId, normalizePath, SimpleTokenEstimator } from './core/utils.js';
export { createDecayPolicy } from './decay/policies.js';
export { DecayEngineImpl } from './decay/decay-engine.js';
export { GarbageCollector } from './decay/gc.js';
export { LLMCompactor } from './decay/compactor.js';
export { SideEffectStoreImpl } from './side-effects/store.js';
export { ToolClusterDetector } from './boundary/tool-cluster.js';
export { SemanticBoundaryDetector } from './boundary/semantic.js';
export { HybridBoundaryDetector } from './boundary/hybrid.js';
export { ClaudeLLMProvider } from './llm/provider.js';
export { TraceAdapter } from './trace/adapter.js';
export { TraceReplayIterator } from './trace/replay.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.ts test/index.test.ts
git commit -m "feat: add public API index with re-exports"
```

---

## Task 14: Integration Test with Real Trace

**Files:**
- Test: `test/integration/replay.test.ts`

- [ ] **Step 1: Copy current session JSONL as fixture**

```bash
cp ~/.claude/projects/C--Users-Eric-Repos-harness/*.jsonl test/fixtures/traces/real-session.jsonl
```

(Use the most recent session file)

- [ ] **Step 2: Write integration test**

```typescript
// test/integration/replay.test.ts
import { describe, it, expect } from 'vitest';
import { TraceReplayIterator } from '../../src/trace/replay.js';
import { ToolClusterDetector } from '../../src/boundary/tool-cluster.js';
import path from 'node:path';
import fs from 'node:fs';

const realTracePath = path.resolve('test/fixtures/traces/real-session.jsonl');

describe('Integration: Real Trace Replay', () => {
  it('should replay a real Claude Code session without errors', async () => {
    if (!fs.existsSync(realTracePath)) {
      console.log('Skipping: no real session trace found. Copy a .jsonl from ~/.claude/projects/ to test/fixtures/traces/real-session.jsonl');
      return;
    }

    const detector = new ToolClusterDetector();
    const iterator = new TraceReplayIterator(
      'C:/Users/Eric/Repos/harness',
      detector
    );
    await iterator.load(realTracePath);
    expect(iterator.eventCount()).toBeGreaterThan(0);

    const result = await iterator.runAll(50000);

    // Basic sanity checks
    expect(result.frames.length).toBeGreaterThan(0);
    expect(result.resolutions.length).toBeGreaterThan(0);

    // Log summary for manual inspection
    console.log('--- Replay Summary ---');
    console.log(`Events: ${iterator.eventCount()}`);
    console.log(`Frames: ${result.frames.length}`);
    console.log(`Resolution snapshots: ${result.resolutions.length}`);
    console.log(`Timeline entries: ${result.timeline.length}`);

    for (const entry of result.timeline) {
      console.log(`  Frame ${entry.frameId}: ${entry.boundary.type} (${entry.boundary.description}) — ${entry.entriesAdded} entries, ${entry.tokensUsed} tokens`);
    }
  });
});
```

- [ ] **Step 3: Run integration test**

Run: `npx vitest run test/integration/replay.test.ts`
Expected: PASS — should replay the full session and print a summary

- [ ] **Step 4: Commit**

```bash
git add test/integration/replay.test.ts
git commit -m "test: add integration test replaying real Claude Code session"
```

---

## Task 15: Run All Tests & Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run build**

Run: `npx tsc`
Expected: No type errors

- [ ] **Step 3: Fix any issues found**

Address any failing tests or type errors.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: fix any remaining issues from full test suite"
```
