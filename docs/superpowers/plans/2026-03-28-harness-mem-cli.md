# harness-mem CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI tool that analyzes Claude Code session logs and produces human-readable summaries, hooking into session lifecycle for automatic capture and briefing.

**Architecture:** Clean rewrite of the existing harness repo. The scope engine, trace replay, boundary detection, decay scoring, and side effect detection are ported and trimmed. New modules: JSONL trace parser (Claude Code specific), LLM summarizer (Vercel AI SDK), digest file storage, and CLI command layer (commander). Two hooks: SessionEnd → digest, SessionStart → recap.

**Tech Stack:** TypeScript (ES2022/NodeNext), Vitest, Vercel AI SDK (`ai` + `@ai-sdk/anthropic`), commander, tsx

**Spec:** `docs/superpowers/specs/2026-03-28-harness-mem-cli-design.md`

---

## Task 0: Project Scaffolding

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `bin/harness-mem.ts`
- Delete: all files under `src/` (old code, preserved in git history)
- Delete: all files under `test/` (old tests)

- [ ] **Step 1: Remove old source and test files**

```bash
rm -rf src/ test/
```

- [ ] **Step 2: Update package.json**

```json
{
  "name": "harness-mem",
  "version": "0.1.0",
  "description": "Agent session memory CLI — analyzes session logs and produces human-readable summaries",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "harness-mem": "./bin/harness-mem.ts"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "tsx bin/harness-mem.ts"
  },
  "keywords": ["claude-code", "agent", "session", "memory", "cli"],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "ai": "^4.0.0",
    "@ai-sdk/anthropic": "^1.0.0",
    "commander": "^13.0.0"
  },
  "devDependencies": {
    "@types/node": "^25.5.0",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3",
    "vitest": "^4.1.0"
  }
}
```

- [ ] **Step 3: Update tsconfig.json**

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

- [ ] **Step 4: Create bin entry point**

```typescript
#!/usr/bin/env tsx
// bin/harness-mem.ts
import { run } from '../src/cli/index.js';

run(process.argv);
```

- [ ] **Step 5: Create directory structure**

```bash
mkdir -p src/cli src/parser src/engine src/summarizer src/storage
mkdir -p test/cli test/parser test/engine test/summarizer test/storage
mkdir -p test/fixtures/traces
```

- [ ] **Step 6: Install dependencies**

```bash
npm install
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold harness-mem CLI project (clean rewrite)"
```

---

## Task 1: Core Types

**Files:**
- Create: `src/engine/types.ts`
- Test: `test/engine/types.test.ts`

Port and trim the type definitions from the original `src/core/types.ts`. Drop types related to dropped features (LLM compactor, semantic boundary). Add new types for the CLI (config, digest metadata).

- [ ] **Step 1: Write the failing test**

```typescript
// test/engine/types.test.ts
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
} from '../src/engine/types.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/engine/types.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the types module**

Port from original `src/core/types.ts`, trimming interfaces for dropped features. Add `DigestMetadata` and `HarnessMemConfig`. Key types to keep:
- `ContextEntry`, `ContextFrame`, `BoundarySignal`, `DecayPolicy`
- `Artifact`, `ArtifactSnapshot`, `AccessLog`
- `TraceEvent` (types: user-message, assistant-text, tool-call, tool-result, system-reminder)
- `ResolvedContext`, `ScopeEngineConfig`, `ReplayResult`
- `TokenEstimator`, `BoundaryDetector` interfaces

New types to add:
- `DigestMetadata` — YAML frontmatter fields (sessionId, timestamp, durationMinutes, model, workingDirectory)
- `HarnessMemConfig` — config.json shape (digestDir, transcriptDir, defaultModel, defaultProvider, recap, clean)

Drop:
- `LLMProvider` interface (replaced by Vercel AI SDK)
- `Compactor` interface (dropped feature)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/engine/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts test/engine/types.test.ts
git commit -m "feat: add core type definitions for harness-mem"
```

---

## Task 2: Utilities

**Files:**
- Create: `src/engine/utils.ts`
- Test: `test/engine/utils.test.ts`

Port `generateId`, `normalizePath`, `SimpleTokenEstimator` from original `src/core/utils.ts`. Add `parseDuration` utility for CLI flag parsing (e.g., "24h" → milliseconds).

- [ ] **Step 1: Write the failing test**

```typescript
// test/engine/utils.test.ts
import { describe, it, expect } from 'vitest';
import { generateId, normalizePath, estimateTokens, parseDuration } from '../src/engine/utils.js';

describe('generateId', () => {
  it('should return a UUID string', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should return unique IDs', () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
  });
});

describe('normalizePath', () => {
  it('should resolve relative paths against working directory', () => {
    const result = normalizePath('src/foo.ts', '/home/user/project');
    expect(result).toContain('src/foo.ts');
  });

  it('should lowercase for case-insensitive comparison', () => {
    const result = normalizePath('/Home/User/File.ts');
    expect(result).toBe(result.toLowerCase());
  });
});

describe('estimateTokens', () => {
  it('should estimate tokens as length / 4', () => {
    expect(estimateTokens('hello world')).toBe(3); // 11 / 4 = 2.75 → 3
  });

  it('should handle null/undefined', () => {
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
  });
});

describe('parseDuration', () => {
  it('should parse hours', () => {
    expect(parseDuration('24h')).toBe(24 * 60 * 60 * 1000);
  });

  it('should parse days', () => {
    expect(parseDuration('30d')).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('should parse minutes', () => {
    expect(parseDuration('15m')).toBe(15 * 60 * 1000);
  });

  it('should throw on invalid format', () => {
    expect(() => parseDuration('abc')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/engine/utils.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the utils module**

Port `generateId` (using native `crypto.randomUUID()` — no uuid package needed), `normalizePath` (path.resolve + lowercase), `estimateTokens` (string.length / 4, ceil). Add `parseDuration` that parses `Nm`, `Nh`, `Nd` into milliseconds.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/engine/utils.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/utils.ts test/engine/utils.test.ts
git commit -m "feat: add utility functions (ID generation, path normalization, duration parsing)"
```

---

## Task 3: Decay Engine

**Files:**
- Create: `src/engine/decay.ts`
- Test: `test/engine/decay.test.ts`

Port `DecayEngineImpl` and `createDecayPolicy` from original `src/decay/decay-engine.ts` and `src/decay/policies.ts`. Also port `GarbageCollector` from `src/decay/gc.ts`. Drop `LLMCompactor`.

- [ ] **Step 1: Write the failing test**

```typescript
// test/engine/decay.test.ts
import { describe, it, expect } from 'vitest';
import { DecayEngine, createDecayPolicy, GarbageCollector } from '../src/engine/decay.js';
import type { ContextEntry, ContextFrame } from '../src/engine/types.js';

// Helper to create a test entry
function makeEntry(overrides: Partial<ContextEntry> = {}): ContextEntry {
  return {
    id: 'e1',
    frameId: 'f1',
    type: 'conversational',
    content: 'test',
    tokenEstimate: 10,
    createdAt: Date.now() - 60000, // 1 minute ago
    decayPolicy: { strategy: 'none' },
    metadata: {},
    references: [],
    ...overrides,
  };
}

describe('createDecayPolicy', () => {
  it('should create a none policy', () => {
    const policy = createDecayPolicy('none');
    expect(policy.strategy).toBe('none');
  });

  it('should create a linear policy with halfLife', () => {
    const policy = createDecayPolicy('linear', { halfLife: 5000 });
    expect(policy.strategy).toBe('linear');
    expect(policy.halfLife).toBe(5000);
  });

  it('should create a step policy with retainUntil', () => {
    const policy = createDecayPolicy('step', { retainUntil: 3 });
    expect(policy.strategy).toBe('step');
    expect(policy.retainUntil).toBe(3);
  });
});

describe('DecayEngine', () => {
  it('should return 1.0 for none strategy', () => {
    const engine = new DecayEngine();
    const entry = makeEntry({ decayPolicy: { strategy: 'none' } });
    expect(engine.score(entry, 0)).toBe(1.0);
  });

  it('should decay linearly with half-life', () => {
    const engine = new DecayEngine();
    const halfLife = 10000;
    const entry = makeEntry({
      createdAt: Date.now() - halfLife,
      decayPolicy: { strategy: 'linear', halfLife },
    });
    const score = engine.score(entry, 0);
    expect(score).toBeGreaterThan(0.4);
    expect(score).toBeLessThan(0.6);
  });

  it('should apply access boost', () => {
    const engine = new DecayEngine();
    const entry = makeEntry({
      decayPolicy: { strategy: 'linear', halfLife: 10000 },
      createdAt: Date.now() - 10000,
      accessLog: { lastAccessed: Date.now(), accessCount: 5 },
    });
    const boosted = engine.score(entry, 0);
    const entryNoAccess = makeEntry({
      decayPolicy: { strategy: 'linear', halfLife: 10000 },
      createdAt: Date.now() - 10000,
    });
    const unboosted = engine.score(entryNoAccess, 0);
    expect(boosted).toBeGreaterThan(unboosted);
  });

  it('should penalize entries in abandoned frames', () => {
    const engine = new DecayEngine();
    const entry = makeEntry({
      decayPolicy: { strategy: 'linear', halfLife: 60000 },
    });
    const normal = engine.score(entry, 0);
    const penalized = engine.score(entry, 0, true);
    expect(penalized).toBeLessThan(normal);
  });
});

describe('GarbageCollector', () => {
  it('should classify entries into retained, compacted, and collected', () => {
    const gc = new GarbageCollector(new DecayEngine());

    const retained = makeEntry({ id: 'r1', decayPolicy: { strategy: 'none' } });
    const collected = makeEntry({
      id: 'c1',
      createdAt: Date.now() - 1000000,
      decayPolicy: { strategy: 'linear', halfLife: 1000 },
    });

    const result = gc.classify([retained, collected], new Map());
    expect(result.retained.some(e => e.id === 'r1')).toBe(true);
    expect(result.collected.some(e => e.id === 'c1')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/engine/decay.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the decay module**

Port `createDecayPolicy`, `DecayEngine` (renamed from `DecayEngineImpl`), and `GarbageCollector` into a single `src/engine/decay.ts`. Keep the same scoring logic: base score by strategy, access boost (frequency + recency), abandoned frame penalty. GC thresholds: retained ≥ 0.4, compacted ≥ 0.1, collected < 0.1. Drop the compacted bucket's LLM integration — just classify, don't compact.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/engine/decay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/decay.ts test/engine/decay.test.ts
git commit -m "feat: add decay engine and garbage collector"
```

---

## Task 4: Boundary Detector

**Files:**
- Create: `src/engine/boundary.ts`
- Test: `test/engine/boundary.test.ts`

Port `ToolClusterDetector` from original `src/boundary/tool-cluster.ts`. This is the only boundary detector we keep (semantic and hybrid are dropped).

- [ ] **Step 1: Write the failing test**

```typescript
// test/engine/boundary.test.ts
import { describe, it, expect } from 'vitest';
import { ToolClusterDetector } from '../src/engine/boundary.js';
import type { ContextEntry } from '../src/engine/types.js';

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
      id: 'e-text',
      frameId: 'f1',
      type: 'conversational',
      content: 'just text',
      tokenEstimate: 10,
      createdAt: Date.now(),
      decayPolicy: { strategy: 'none' },
      metadata: {},
      references: [],
    };

    const signal = await detector.detect(current, history);
    expect(signal).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/engine/boundary.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the boundary module**

Port `ToolClusterDetector` with its `detect(current, history)` method. Fires on tool name change (confidence 0.8) or time gap exceeding threshold (confidence 0.6). Ignores entries without `metadata.toolName`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/engine/boundary.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/boundary.ts test/engine/boundary.test.ts
git commit -m "feat: add tool-cluster boundary detector"
```

---

## Task 5: Side Effect Extraction

**Files:**
- Create: `src/engine/side-effects.ts`
- Test: `test/engine/side-effects.test.ts`

Port `SideEffectStoreImpl` from `src/side-effects/store.ts` and `detectSideEffect` from `src/trace/side-effect-detector.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// test/engine/side-effects.test.ts
import { describe, it, expect } from 'vitest';
import { detectSideEffect, SideEffectStore } from '../src/engine/side-effects.js';

describe('detectSideEffect', () => {
  it('should detect Edit as side effect', () => {
    const result = detectSideEffect('Edit', { file_path: '/src/foo.ts', old_string: 'a', new_string: 'b' });
    expect(result.hasSideEffect).toBe(true);
    expect(result.paths).toContain('/src/foo.ts');
  });

  it('should detect Write as side effect', () => {
    const result = detectSideEffect('Write', { file_path: '/src/bar.ts', content: 'hello' });
    expect(result.hasSideEffect).toBe(true);
    expect(result.paths).toContain('/src/bar.ts');
  });

  it('should not detect Read as side effect', () => {
    const result = detectSideEffect('Read', { file_path: '/src/foo.ts' });
    expect(result.hasSideEffect).toBe(false);
  });

  it('should detect destructive Bash commands', () => {
    const result = detectSideEffect('Bash', { command: 'rm -rf dist/' });
    expect(result.hasSideEffect).toBe(true);
  });

  it('should detect git mutations', () => {
    const result = detectSideEffect('Bash', { command: 'git commit -m "fix"' });
    expect(result.hasSideEffect).toBe(true);
  });

  it('should not detect safe Bash commands', () => {
    const result = detectSideEffect('Bash', { command: 'ls -la' });
    expect(result.hasSideEffect).toBe(false);
  });
});

describe('SideEffectStore', () => {
  it('should record and retrieve artifacts', () => {
    const store = new SideEffectStore('/project');
    store.record({ id: 'a1', type: 'file', location: 'src/foo.ts', state: 'created', createdAt: Date.now() });
    const artifact = store.get('src/foo.ts');
    expect(artifact).not.toBeNull();
    expect(artifact!.state).toBe('created');
  });

  it('should update artifacts with snapshots', () => {
    const store = new SideEffectStore('/project');
    store.record({ id: 'a1', type: 'file', location: 'src/foo.ts', state: 'created', createdAt: Date.now() });
    store.update('src/foo.ts', { state: 'modified' });
    const artifact = store.get('src/foo.ts');
    expect(artifact!.state).toBe('modified');
    expect(artifact!.snapshots!.length).toBe(1);
  });

  it('should normalize paths for lookup', () => {
    const store = new SideEffectStore('/project');
    store.record({ id: 'a1', type: 'file', location: 'src/Foo.ts', state: 'created', createdAt: Date.now() });
    const artifact = store.get('src/foo.ts');
    expect(artifact).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/engine/side-effects.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the side-effects module**

Port `detectSideEffect` (tool classification: Read/Glob/Grep safe, Edit/Write/NotebookEdit side-effect, Bash pattern-matched) and `SideEffectStore` (path-normalized artifact map with record/get/update/all).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/engine/side-effects.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/side-effects.ts test/engine/side-effects.test.ts
git commit -m "feat: add side effect detection and artifact store"
```

---

## Task 6: Scope Engine

**Files:**
- Create: `src/engine/scope-engine.ts`
- Test: `test/engine/scope-engine.test.ts`

Port `ScopeEngineImpl` from `src/core/scope-engine.ts` and `ScopeChain` from `src/core/scope-chain.ts`. Combine into one module since the chain is only used internally by the engine.

- [ ] **Step 1: Write the failing test**

```typescript
// test/engine/scope-engine.test.ts
import { describe, it, expect } from 'vitest';
import { ScopeEngine } from '../src/engine/scope-engine.js';
import type { BoundarySignal } from '../src/engine/types.js';

describe('ScopeEngine', () => {
  it('should start with one root frame', () => {
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    expect(engine.getCurrentFrame()).not.toBeNull();
    expect(engine.getFrameCount()).toBe(1);
  });

  it('should push a new frame on boundary', () => {
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    const signal: BoundarySignal = { type: 'tool-cluster', confidence: 0.8 };
    engine.pushFrame(signal);
    expect(engine.getFrameCount()).toBe(2);
  });

  it('should add entries to current frame', () => {
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    const entryId = engine.addEntry({
      type: 'conversational',
      content: 'test',
      tokenEstimate: 10,
      decayPolicy: { strategy: 'none' },
    });
    expect(entryId).toBeDefined();
  });

  it('should resolve context with token budget', () => {
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    engine.addEntry({
      type: 'conversational',
      content: 'entry 1',
      tokenEstimate: 100,
      decayPolicy: { strategy: 'none' },
    });
    engine.addEntry({
      type: 'side-effect',
      content: 'file created',
      tokenEstimate: 50,
      decayPolicy: { strategy: 'none' },
    });
    const resolved = engine.resolve(500);
    expect(resolved.entries.length).toBe(2);
    expect(resolved.totalTokens).toBe(150);
  });

  it('should respect token budget by dropping low-scored entries', () => {
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    // Add entries exceeding budget
    for (let i = 0; i < 20; i++) {
      engine.addEntry({
        type: 'conversational',
        content: `entry ${i}`,
        tokenEstimate: 100,
        decayPolicy: { strategy: 'linear', halfLife: 5000 },
      });
    }
    const resolved = engine.resolve(500); // budget for ~5 entries
    expect(resolved.totalTokens).toBeLessThanOrEqual(500);
    expect(resolved.droppedEntries).toBeGreaterThan(0);
  });

  it('should record side effects as artifacts', () => {
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    engine.recordSideEffect({
      id: 'a1',
      type: 'file',
      location: 'src/foo.ts',
      state: 'created',
      createdAt: Date.now(),
    });
    const resolved = engine.resolve(1000);
    expect(resolved.artifacts.length).toBe(1);
  });

  it('should pop frame and complete it', () => {
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    engine.pushFrame({ type: 'tool-cluster', confidence: 0.8 });
    expect(engine.getFrameCount()).toBe(2);
    engine.popFrame();
    expect(engine.getFrameCount()).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/engine/scope-engine.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the scope engine module**

Port `ScopeEngineImpl` (frame stack management, entry registry, artifact tracking via SideEffectStore, resolve via ScopeChain) and inline `ScopeChain` (tiered scoring: tier 1 = current frame, tier 2 = captured parents, tier 3 = rest; apply decay scores; sort descending; respect token budget). Rename class to `ScopeEngine`.

Public API: `pushFrame()`, `popFrame()`, `addEntry()`, `recordSideEffect()`, `resolve(budget)`, `getCurrentFrame()`, `getFrameCount()`, `getEntries()`, `gc()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/engine/scope-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/scope-engine.ts test/engine/scope-engine.test.ts
git commit -m "feat: add scope engine with frame management and resolution"
```

---

## Task 7: Trace Parser

**Files:**
- Create: `src/parser/trace-parser.ts`
- Create: `test/fixtures/traces/sample-session.jsonl`
- Test: `test/parser/trace-parser.test.ts`

Port and adapt `TraceAdapter` from `src/trace/adapter.ts`. This parses Claude Code JSONL transcripts into normalized `TraceEvent` arrays.

- [ ] **Step 1: Create a sample JSONL fixture**

Create a minimal but realistic Claude Code session transcript at `test/fixtures/traces/sample-session.jsonl` with:
- A user message
- An assistant response with text + tool call (Read)
- A tool result
- An assistant response with text + tool call (Edit)
- A tool result
- A final assistant text response

Use the schema discovered during research: each line has `type`, `timestamp`, `sessionId`, `message` (with `role` and `content` array).

- [ ] **Step 2: Write the failing test**

```typescript
// test/parser/trace-parser.test.ts
import { describe, it, expect } from 'vitest';
import { TraceParser } from '../src/parser/trace-parser.js';
import path from 'path';

const FIXTURE_PATH = path.join(__dirname, '../fixtures/traces/sample-session.jsonl');

describe('TraceParser', () => {
  it('should parse JSONL file into raw entries', async () => {
    const parser = new TraceParser();
    const raw = await parser.parseRaw(FIXTURE_PATH);
    expect(raw.length).toBeGreaterThan(0);
    expect(raw[0]).toHaveProperty('type');
    expect(raw[0]).toHaveProperty('timestamp');
  });

  it('should decompose raw entries into TraceEvents', async () => {
    const parser = new TraceParser();
    const raw = await parser.parseRaw(FIXTURE_PATH);
    const events = parser.decompose(raw);

    expect(events.length).toBeGreaterThan(0);

    const types = events.map(e => e.type);
    expect(types).toContain('user-message');
    expect(types).toContain('tool-call');
    expect(types).toContain('tool-result');
  });

  it('should detect side effects on tool calls', async () => {
    const parser = new TraceParser();
    const raw = await parser.parseRaw(FIXTURE_PATH);
    const events = parser.decompose(raw);

    const editCall = events.find(e => e.type === 'tool-call' && e.metadata?.toolName === 'Edit');
    expect(editCall).toBeDefined();
    expect(editCall!.sideEffect?.hasSideEffect).toBe(true);
  });

  it('should extract session metadata', async () => {
    const parser = new TraceParser();
    const raw = await parser.parseRaw(FIXTURE_PATH);
    const metadata = parser.extractMetadata(raw);

    expect(metadata.sessionId).toBeDefined();
    expect(metadata.startTime).toBeDefined();
    expect(metadata.endTime).toBeDefined();
  });

  it('should skip progress entries', async () => {
    const parser = new TraceParser();
    const raw = await parser.parseRaw(FIXTURE_PATH);
    const events = parser.decompose(raw);

    const progressEvents = events.filter(e => e.type === 'progress' as any);
    expect(progressEvents.length).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/parser/trace-parser.test.ts`
Expected: FAIL

- [ ] **Step 4: Write the trace parser**

Port `TraceAdapter` as `TraceParser` with:
- `parseRaw(filePath)`: Read JSONL, split lines, parse JSON, return raw entries
- `decompose(rawEntries)`: Convert to `TraceEvent[]` — split assistant messages into text + tool_use blocks, create tool-call events (with side effect detection via `detectSideEffect`), create tool-result events, skip progress entries
- `extractMetadata(rawEntries)`: Pull sessionId, first/last timestamps, cwd from raw entries

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/parser/trace-parser.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/parser/trace-parser.ts test/parser/trace-parser.test.ts test/fixtures/traces/sample-session.jsonl
git commit -m "feat: add JSONL trace parser with side effect detection"
```

---

## Task 8: Replay Iterator

**Files:**
- Create: `src/engine/replay.ts`
- Test: `test/engine/replay.test.ts`

Port `TraceReplayIterator` from `src/trace/replay.ts`. Drives the scope engine through a parsed trace, detecting boundaries and recording resolution points.

- [ ] **Step 1: Write the failing test**

```typescript
// test/engine/replay.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ReplayIterator } from '../src/engine/replay.js';
import { ScopeEngine } from '../src/engine/scope-engine.js';
import { ToolClusterDetector } from '../src/engine/boundary.js';
import type { TraceEvent } from '../src/engine/types.js';

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
  it('should iterate through all events', () => {
    const events = makeEvents();
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    const detector = new ToolClusterDetector();
    const iterator = new ReplayIterator(events, engine, detector);

    let count = 0;
    while (iterator.hasNext()) {
      iterator.next();
      count++;
    }
    expect(count).toBe(events.length);
  });

  it('should detect boundaries and push frames', () => {
    const events = makeEvents();
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    const detector = new ToolClusterDetector();
    const iterator = new ReplayIterator(events, engine, detector);

    iterator.runAll();
    // Should have pushed at least one frame (Read → Edit tool switch)
    expect(engine.getFrameCount()).toBeGreaterThan(1);
  });

  it('should record side effects as artifacts', () => {
    const events = makeEvents();
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    const detector = new ToolClusterDetector();
    const iterator = new ReplayIterator(events, engine, detector);

    const result = iterator.runAll();
    expect(result.sideEffects.length).toBeGreaterThan(0);
  });

  it('should support resolution point inspection', () => {
    const events = makeEvents();
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    const detector = new ToolClusterDetector();
    const iterator = new ReplayIterator(events, engine, detector);

    const result = iterator.runAll();
    expect(result.resolutions.length).toBeGreaterThan(0);
  });

  it('should track frame timeline', () => {
    const events = makeEvents();
    const engine = new ScopeEngine({ maxFrameDepth: 50 }, '/project');
    const detector = new ToolClusterDetector();
    const iterator = new ReplayIterator(events, engine, detector);

    const result = iterator.runAll();
    expect(result.frames.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/engine/replay.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the replay iterator**

Port `TraceReplayIterator` as `ReplayIterator`. Constructor takes `(events, scopeEngine, boundaryDetector)`. Methods:
- `hasNext()` / `next()`: Step through events one at a time
- `inspect()`: Return current scope state (resolution at current point)
- `runAll()`: Process entire trace, record resolutions at user-message and tool-result events, return `ReplayResult` with frames, resolutions, sideEffects, and timeline

Each `next()` call: create ContextEntry from TraceEvent, detect boundary (push frame if triggered), add entry to engine, record side effects as artifacts.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/engine/replay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/replay.ts test/engine/replay.test.ts
git commit -m "feat: add replay iterator with inspection API"
```

---

## Task 9: Digest Storage

**Files:**
- Create: `src/storage/digest-store.ts`
- Test: `test/storage/digest-store.test.ts`

Implements digest file management: write, read, query by time/session, delete by age.

- [ ] **Step 1: Write the failing test**

```typescript
// test/storage/digest-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DigestStore } from '../src/storage/digest-store.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let tmpDir: string;
let store: DigestStore;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-test-'));
  store = new DigestStore(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('DigestStore', () => {
  it('should write a digest file with frontmatter and body', async () => {
    await store.write({
      sessionId: 'abc-123',
      timestamp: '2026-03-28T14:30:00Z',
      durationMinutes: 45,
      model: 'claude-haiku-4-5-20251001',
      workingDirectory: '/home/user/project',
    }, '## What you worked on\n\nYou built a feature.');

    const files = await fs.readdir(tmpDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/\.md$/);

    const content = await fs.readFile(path.join(tmpDir, files[0]), 'utf-8');
    expect(content).toContain('session_id: abc-123');
    expect(content).toContain('## What you worked on');
  });

  it('should check if digest exists for session ID', async () => {
    expect(await store.exists('abc-123')).toBe(false);

    await store.write({
      sessionId: 'abc-123',
      timestamp: '2026-03-28T14:30:00Z',
      durationMinutes: 45,
      model: 'claude-haiku-4-5-20251001',
      workingDirectory: '/project',
    }, 'Summary');

    expect(await store.exists('abc-123')).toBe(true);
  });

  it('should read digests filtered by time', async () => {
    await store.write({
      sessionId: 'recent',
      timestamp: new Date().toISOString(),
      durationMinutes: 10,
      model: 'haiku',
      workingDirectory: '/project',
    }, 'Recent work');

    const digests = await store.query({ since: 24 * 60 * 60 * 1000 });
    expect(digests.length).toBe(1);
    expect(digests[0].metadata.sessionId).toBe('recent');
    expect(digests[0].body).toContain('Recent work');
  });

  it('should return digests sorted newest-first', async () => {
    await store.write({
      sessionId: 'older',
      timestamp: '2026-03-27T10:00:00Z',
      durationMinutes: 10,
      model: 'haiku',
      workingDirectory: '/project',
    }, 'Older work');

    await store.write({
      sessionId: 'newer',
      timestamp: '2026-03-28T10:00:00Z',
      durationMinutes: 10,
      model: 'haiku',
      workingDirectory: '/project',
    }, 'Newer work');

    const digests = await store.query({ since: 7 * 24 * 60 * 60 * 1000 });
    expect(digests[0].metadata.sessionId).toBe('newer');
    expect(digests[1].metadata.sessionId).toBe('older');
  });

  it('should delete digests older than threshold', async () => {
    await store.write({
      sessionId: 'old',
      timestamp: '2026-01-01T00:00:00Z',
      durationMinutes: 10,
      model: 'haiku',
      workingDirectory: '/project',
    }, 'Old work');

    const deleted = await store.clean({ olderThanMs: 24 * 60 * 60 * 1000 });
    expect(deleted).toBe(1);

    const files = await fs.readdir(tmpDir);
    expect(files.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/storage/digest-store.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the digest store**

`DigestStore` class with constructor taking `digestDir: string`. Methods:
- `write(metadata: DigestMetadata, body: string)`: Format as markdown with YAML frontmatter, write to `YYYY-MM-DD-HHmmss-<shortHash>.md`
- `exists(sessionId: string)`: Check if any file contains matching session_id in frontmatter
- `query({ since?: number })`: Read all digest files, parse frontmatter, filter by time, sort newest-first, return `{ metadata, body }[]`
- `clean({ olderThanMs?: number, beforeDate?: Date, dryRun?: boolean })`: Delete matching files, return count
- `read(filePath: string)`: Parse a single digest file into metadata + body

Short hash: first 8 chars of session ID.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/storage/digest-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/storage/digest-store.ts test/storage/digest-store.test.ts
git commit -m "feat: add digest file storage with query and cleanup"
```

---

## Task 10: Summarizer

**Files:**
- Create: `src/summarizer/summarizer.ts`
- Create: `src/summarizer/formatter.ts`
- Test: `test/summarizer/summarizer.test.ts`
- Test: `test/summarizer/formatter.test.ts`

The summarizer takes resolved scope data and calls an LLM to produce the human-readable summary. The formatter handles the digest markdown structure.

- [ ] **Step 1: Write the formatter test**

```typescript
// test/summarizer/formatter.test.ts
import { describe, it, expect } from 'vitest';
import { formatDigest, parseDigest } from '../src/summarizer/formatter.js';
import type { DigestMetadata } from '../src/engine/types.js';

describe('formatDigest', () => {
  it('should format metadata as YAML frontmatter with body', () => {
    const metadata: DigestMetadata = {
      sessionId: 'abc-123',
      timestamp: '2026-03-28T14:30:00Z',
      durationMinutes: 45,
      model: 'claude-haiku-4-5-20251001',
      workingDirectory: '/home/user/project',
    };
    const body = '## What you worked on\n\nYou did stuff.';
    const result = formatDigest(metadata, body);

    expect(result).toContain('---');
    expect(result).toContain('session_id: abc-123');
    expect(result).toContain('duration_minutes: 45');
    expect(result).toContain('## What you worked on');
  });
});

describe('parseDigest', () => {
  it('should parse frontmatter and body from digest markdown', () => {
    const input = `---
session_id: abc-123
timestamp: 2026-03-28T14:30:00Z
duration_minutes: 45
model: claude-haiku-4-5-20251001
working_directory: /home/user/project
---

## What you worked on

You did stuff.`;

    const { metadata, body } = parseDigest(input);
    expect(metadata.sessionId).toBe('abc-123');
    expect(metadata.durationMinutes).toBe(45);
    expect(body).toContain('## What you worked on');
  });
});
```

- [ ] **Step 2: Write the summarizer test**

```typescript
// test/summarizer/summarizer.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Summarizer } from '../src/summarizer/summarizer.js';
import type { ResolvedContext } from '../src/engine/types.js';

// Mock the Vercel AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: `## What you worked on

You were editing foo.ts to add a new feature.

## What changed

- Modified \`src/foo.ts:42\` — added validation logic

## Decisions made

- Chose runtime validation over compile-time checks

## Still open

- Tests not yet written`,
  }),
}));

describe('Summarizer', () => {
  it('should generate a summary from resolved context', async () => {
    const summarizer = new Summarizer({ model: 'claude-haiku-4-5-20251001', provider: 'anthropic' });

    const resolved: ResolvedContext = {
      entries: [
        {
          id: 'e1', frameId: 'f1', type: 'conversational',
          content: 'Edit src/foo.ts', tokenEstimate: 10,
          createdAt: Date.now(), decayPolicy: { strategy: 'none' },
          metadata: { toolName: 'Edit' }, references: [],
        },
      ],
      artifacts: [
        { id: 'a1', type: 'file', location: 'src/foo.ts', state: 'modified', createdAt: Date.now() },
      ],
      totalTokens: 10,
      budget: 1000,
      droppedEntries: 0,
    };

    const summary = await summarizer.summarize(resolved);
    expect(summary).toContain('## What you worked on');
    expect(summary).toContain('## What changed');
  });

  it('should include side effects in the prompt', async () => {
    const { generateText } = await import('ai');
    const summarizer = new Summarizer({ model: 'claude-haiku-4-5-20251001', provider: 'anthropic' });

    const resolved: ResolvedContext = {
      entries: [],
      artifacts: [
        { id: 'a1', type: 'file', location: 'src/foo.ts', state: 'created', createdAt: Date.now() },
      ],
      totalTokens: 0,
      budget: 1000,
      droppedEntries: 0,
    };

    await summarizer.summarize(resolved);

    expect(generateText).toHaveBeenCalled();
    const call = (generateText as any).mock.calls[0][0];
    expect(call.prompt).toContain('src/foo.ts');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run test/summarizer/`
Expected: FAIL

- [ ] **Step 4: Write the formatter module**

`formatDigest(metadata, body)`: Serialize DigestMetadata as YAML frontmatter, append body. `parseDigest(content)`: Split on `---` delimiters, parse YAML frontmatter fields, return `{ metadata, body }`. Hand-rolled YAML parsing (simple key: value pairs, no library needed).

- [ ] **Step 5: Write the summarizer module**

`Summarizer` class, constructor takes `{ model, provider }`. Uses Vercel AI SDK with a provider registry for dynamic provider resolution:

```typescript
import { generateText } from 'ai';

// Provider registry — maps provider name to dynamic import
const PROVIDER_REGISTRY: Record<string, () => Promise<any>> = {
  anthropic: async () => (await import('@ai-sdk/anthropic')).anthropic,
  openai: async () => (await import('@ai-sdk/openai')).openai,
  google: async () => (await import('@ai-sdk/google')).google,
};
```

The registry uses dynamic `import()` so missing provider packages fail with a clear error message (e.g., "Provider 'openai' requires @ai-sdk/openai — install it with: npm install @ai-sdk/openai") rather than crashing at startup. Only `@ai-sdk/anthropic` ships as a dependency; other providers are opt-in.

Method `summarize(resolved: ResolvedContext)`:
1. Look up provider in registry, dynamic-import the SDK, get the model factory
2. Build a prompt that includes:
   - List of retained context entries (grouped by frame/boundary)
   - List of side effects (files created/modified/deleted, commands run)
   - Frame boundary information
   - Instructions for the "handoff note" format (What you worked on, What changed, Decisions made, Still open)
3. Call `generateText({ model: providerFactory(modelName), prompt })`

Returns the LLM's response text.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/summarizer/`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/summarizer/ test/summarizer/
git commit -m "feat: add LLM summarizer and digest formatter"
```

---

## Task 11: Configuration Loader

**Files:**
- Create: `src/cli/config.ts`
- Test: `test/cli/config.test.ts`

Loads and merges configuration from defaults, config file, env vars, and CLI flags.

- [ ] **Step 1: Write the failing test**

```typescript
// test/cli/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/cli/config.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-config-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('should return defaults when no config file exists', async () => {
    const config = await loadConfig({ configDir: tmpDir });
    expect(config.digestDir).toContain('digests');
    expect(config.defaultModel).toBe('claude-haiku-4-5-20251001');
    expect(config.recap.since).toBe('24h');
    expect(config.recap.maxLength).toBe(20000);
    expect(config.recap.maxFallbackDigests).toBe(10);
    expect(config.clean.olderThan).toBe('30d');
  });

  it('should merge config file values over defaults', async () => {
    const configPath = path.join(tmpDir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify({
      defaultModel: 'claude-sonnet-4-20250514',
      recap: { maxLength: 50000 },
    }));

    const config = await loadConfig({ configDir: tmpDir });
    expect(config.defaultModel).toBe('claude-sonnet-4-20250514');
    expect(config.recap.maxLength).toBe(50000);
    // Other defaults preserved
    expect(config.recap.since).toBe('24h');
  });

  it('should apply env var overrides', async () => {
    process.env.HARNESS_MEM_MODEL = 'gpt-4o';
    const config = await loadConfig({ configDir: tmpDir });
    expect(config.defaultModel).toBe('gpt-4o');
    delete process.env.HARNESS_MEM_MODEL;
  });

  it('should apply CLI flag overrides', async () => {
    const config = await loadConfig({
      configDir: tmpDir,
      flags: { digestDir: '/custom/path', model: 'custom-model' },
    });
    expect(config.digestDir).toBe('/custom/path');
    expect(config.defaultModel).toBe('custom-model');
  });

  it('should respect priority: flags > env > file > defaults', async () => {
    const configPath = path.join(tmpDir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify({ defaultModel: 'from-file' }));
    process.env.HARNESS_MEM_MODEL = 'from-env';

    const config = await loadConfig({
      configDir: tmpDir,
      flags: { model: 'from-flag' },
    });
    expect(config.defaultModel).toBe('from-flag');
    delete process.env.HARNESS_MEM_MODEL;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/cli/config.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the config module**

`loadConfig(options)` function:
1. Start with defaults (digestDir, transcriptDir, defaultModel, defaultProvider, recap, clean)
2. Try to read `<configDir>/config.json`, deep-merge over defaults
3. Apply env vars: `HARNESS_MEM_DIGEST_DIR`, `HARNESS_MEM_TRANSCRIPT_DIR`, `HARNESS_MEM_MODEL`
4. Apply CLI flags from `options.flags`
5. Return fully resolved `HarnessMemConfig`

Default `configDir`: `~/.harness-mem/`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/cli/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/config.ts test/cli/config.test.ts
git commit -m "feat: add configuration loader with layered overrides"
```

---

## Task 12: Digest Command

**Files:**
- Create: `src/cli/digest.ts`
- Test: `test/cli/digest.test.ts`

Orchestrates the digest pipeline: read stdin/args → parse → replay → summarize → write.

- [ ] **Step 1: Write the failing test**

```typescript
// test/cli/digest.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runDigest } from '../src/cli/digest.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock the summarizer to avoid real LLM calls
vi.mock('../src/summarizer/summarizer.js', () => ({
  Summarizer: vi.fn().mockImplementation(() => ({
    summarize: vi.fn().mockResolvedValue(
      '## What you worked on\n\nYou did stuff.\n\n## What changed\n\n- Created foo.ts'
    ),
  })),
}));

let tmpDigestDir: string;

beforeEach(async () => {
  tmpDigestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-digest-'));
});

afterEach(async () => {
  await fs.rm(tmpDigestDir, { recursive: true, force: true });
});

describe('runDigest', () => {
  const fixturePath = path.join(__dirname, '../fixtures/traces/sample-session.jsonl');

  it('should produce a digest file from a transcript', async () => {
    await runDigest({
      transcriptPath: fixturePath,
      sessionId: 'test-session-123',
      digestDir: tmpDigestDir,
      model: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
    });

    const files = await fs.readdir(tmpDigestDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/\.md$/);

    const content = await fs.readFile(path.join(tmpDigestDir, files[0]), 'utf-8');
    expect(content).toContain('session_id: test-session-123');
    expect(content).toContain('## What you worked on');
  });

  it('should skip if digest already exists for session', async () => {
    // First run
    await runDigest({
      transcriptPath: fixturePath,
      sessionId: 'test-session-123',
      digestDir: tmpDigestDir,
      model: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
    });

    // Second run — should skip
    await runDigest({
      transcriptPath: fixturePath,
      sessionId: 'test-session-123',
      digestDir: tmpDigestDir,
      model: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
    });

    const files = await fs.readdir(tmpDigestDir);
    expect(files.length).toBe(1); // Still just one file
  });

  it('should overwrite with --force', async () => {
    await runDigest({
      transcriptPath: fixturePath,
      sessionId: 'test-session-123',
      digestDir: tmpDigestDir,
      model: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
    });

    await runDigest({
      transcriptPath: fixturePath,
      sessionId: 'test-session-123',
      digestDir: tmpDigestDir,
      model: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
      force: true,
    });

    const files = await fs.readdir(tmpDigestDir);
    // Force may create new file (different timestamp) or overwrite — just verify it worked
    expect(files.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/cli/digest.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the digest command**

`runDigest(options)` function:
1. Check `digestStore.exists(sessionId)` — skip unless `force`
2. Parse transcript: `new TraceParser().parseRaw(transcriptPath)` → `decompose()`
3. Extract metadata: `parser.extractMetadata(raw)`
4. Create scope engine, boundary detector, replay iterator
5. Run replay: `iterator.runAll()`
6. Resolve final scope: `engine.resolve(tokenBudget)`
7. Summarize: `new Summarizer({model, provider}).summarize(resolved)`
8. Write: `digestStore.write(metadata, summary)`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/cli/digest.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/digest.ts test/cli/digest.test.ts
git commit -m "feat: add digest command (parse → replay → summarize → store)"
```

---

## Task 13: Recap Command

**Files:**
- Create: `src/cli/recap.ts`
- Test: `test/cli/recap.test.ts`

Reads saved digests, optionally catches undigested sessions, prints briefing to stdout.

- [ ] **Step 1: Write the failing test**

```typescript
// test/cli/recap.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runRecap } from '../src/cli/recap.js';
import { DigestStore } from '../src/storage/digest-store.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let tmpDigestDir: string;
let store: DigestStore;

beforeEach(async () => {
  tmpDigestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-recap-'));
  store = new DigestStore(tmpDigestDir);
});

afterEach(async () => {
  await fs.rm(tmpDigestDir, { recursive: true, force: true });
});

describe('runRecap', () => {
  it('should return empty message when no digests exist', async () => {
    const output = await runRecap({
      digestDir: tmpDigestDir,
      since: '24h',
      maxLength: 20000,
    });
    expect(output).toContain('No recent sessions');
  });

  it('should return digest content for one recent session', async () => {
    await store.write({
      sessionId: 'sess-1',
      timestamp: new Date().toISOString(),
      durationMinutes: 30,
      model: 'haiku',
      workingDirectory: '/project',
    }, '## What you worked on\n\nYou built a feature.');

    const output = await runRecap({
      digestDir: tmpDigestDir,
      since: '24h',
      maxLength: 20000,
    });
    expect(output).toContain('You built a feature.');
  });

  it('should concatenate multiple digests newest-first', async () => {
    await store.write({
      sessionId: 'older',
      timestamp: '2026-03-27T10:00:00Z',
      durationMinutes: 10,
      model: 'haiku',
      workingDirectory: '/project',
    }, 'Older session content.');

    await store.write({
      sessionId: 'newer',
      timestamp: '2026-03-28T10:00:00Z',
      durationMinutes: 10,
      model: 'haiku',
      workingDirectory: '/project',
    }, 'Newer session content.');

    const output = await runRecap({
      digestDir: tmpDigestDir,
      since: '7d',
      maxLength: 20000,
    });

    const newerIdx = output.indexOf('Newer session content');
    const olderIdx = output.indexOf('Older session content');
    expect(newerIdx).toBeLessThan(olderIdx);
  });

  it('should truncate at maxLength and show note', async () => {
    // Write a large digest
    await store.write({
      sessionId: 'big',
      timestamp: new Date().toISOString(),
      durationMinutes: 120,
      model: 'haiku',
      workingDirectory: '/project',
    }, 'x'.repeat(5000));

    await store.write({
      sessionId: 'also-big',
      timestamp: new Date().toISOString(),
      durationMinutes: 60,
      model: 'haiku',
      workingDirectory: '/project',
    }, 'y'.repeat(5000));

    const output = await runRecap({
      digestDir: tmpDigestDir,
      since: '24h',
      maxLength: 6000,
    });
    expect(output.length).toBeLessThanOrEqual(7000); // some overhead for truncation note
    expect(output).toContain('more sessions not shown');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/cli/recap.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the recap command**

`runRecap(options)` function:
1. Query digests: `store.query({ since: parseDuration(options.since) })`
2. If no digests, return "No recent sessions found."
3. Concatenate bodies newest-first, tracking character count
4. If total exceeds `maxLength`, truncate and append note with count of remaining sessions
5. Return the concatenated string (caller prints to stdout)

Fallback digest logic (scan for undigested transcripts, spawn background processes) is a separate function `spawnFallbackDigests(options)` called before the query step. Uses `child_process.spawn` with `detached: true` and `unref()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/cli/recap.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/recap.ts test/cli/recap.test.ts
git commit -m "feat: add recap command with time filtering and truncation"
```

---

## Task 14: Clean Command

**Files:**
- Create: `src/cli/clean.ts`
- Test: `test/cli/clean.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/cli/clean.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runClean } from '../src/cli/clean.js';
import { DigestStore } from '../src/storage/digest-store.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let tmpDir: string;
let store: DigestStore;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-clean-'));
  store = new DigestStore(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('runClean', () => {
  it('should delete old digests', async () => {
    await store.write({
      sessionId: 'old',
      timestamp: '2025-01-01T00:00:00Z',
      durationMinutes: 10,
      model: 'haiku',
      workingDirectory: '/project',
    }, 'Old stuff');

    const result = await runClean({ digestDir: tmpDir, olderThan: '30d' });
    expect(result.deleted).toBe(1);

    const files = await fs.readdir(tmpDir);
    expect(files.length).toBe(0);
  });

  it('should support dry-run', async () => {
    await store.write({
      sessionId: 'old',
      timestamp: '2025-01-01T00:00:00Z',
      durationMinutes: 10,
      model: 'haiku',
      workingDirectory: '/project',
    }, 'Old stuff');

    const result = await runClean({ digestDir: tmpDir, olderThan: '30d', dryRun: true });
    expect(result.deleted).toBe(0);
    expect(result.wouldDelete).toBe(1);

    const files = await fs.readdir(tmpDir);
    expect(files.length).toBe(1); // Still exists
  });

  it('should not delete recent digests', async () => {
    await store.write({
      sessionId: 'recent',
      timestamp: new Date().toISOString(),
      durationMinutes: 10,
      model: 'haiku',
      workingDirectory: '/project',
    }, 'Recent stuff');

    const result = await runClean({ digestDir: tmpDir, olderThan: '30d' });
    expect(result.deleted).toBe(0);

    const files = await fs.readdir(tmpDir);
    expect(files.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/cli/clean.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the clean command**

`runClean(options)` function: delegates to `store.clean()` with parsed duration. Returns `{ deleted, wouldDelete }` for reporting. Prints human-readable message (e.g., "Deleted 3 digests older than 30 days").

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/cli/clean.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/clean.ts test/cli/clean.test.ts
git commit -m "feat: add clean command with dry-run support"
```

---

## Task 15: CLI Entry Point

**Files:**
- Create: `src/cli/index.ts`
- Test: `test/cli/index.test.ts`

Wires up commander with the three subcommands and stdin parsing for hook mode.

- [ ] **Step 1: Write the failing test**

```typescript
// test/cli/index.test.ts
import { describe, it, expect, vi } from 'vitest';
import { parseStdinPayload, buildProgram } from '../src/cli/index.js';

describe('parseStdinPayload', () => {
  it('should parse valid hook JSON', () => {
    const payload = JSON.stringify({
      session_id: 'abc-123',
      transcript_path: '/path/to/transcript.jsonl',
      cwd: '/project',
      hook_event_name: 'SessionEnd',
    });
    const result = parseStdinPayload(payload);
    expect(result.sessionId).toBe('abc-123');
    expect(result.transcriptPath).toBe('/path/to/transcript.jsonl');
  });

  it('should return null for empty input', () => {
    expect(parseStdinPayload('')).toBeNull();
  });

  it('should return null for invalid JSON', () => {
    expect(parseStdinPayload('not json')).toBeNull();
  });
});

describe('buildProgram', () => {
  it('should register digest, recap, and clean commands', () => {
    const program = buildProgram();
    const commandNames = program.commands.map(c => c.name());
    expect(commandNames).toContain('digest');
    expect(commandNames).toContain('recap');
    expect(commandNames).toContain('clean');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/cli/index.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the CLI entry point**

Using commander:
- `harness-mem digest [path]` — flags: `--digest-dir`, `--model`, `--force`
- `harness-mem recap` — flags: `--since`, `--max-length`, `--no-limit`, `--digest-dir`
- `harness-mem clean` — flags: `--older-than`, `--before`, `--dry-run`

`parseStdinPayload(raw)`: Try JSON.parse, extract `session_id` → `sessionId`, `transcript_path` → `transcriptPath`. Return null on failure.

`run(argv)`: Read stdin (non-blocking check for piped data), build program, parse args, dispatch to command handlers.

Export `buildProgram` for testing and `run` for the bin entry point.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/cli/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/index.ts test/cli/index.test.ts bin/harness-mem.ts
git commit -m "feat: add CLI entry point with commander"
```

---

## Task 16: Integration Test

**Files:**
- Test: `test/integration/digest-pipeline.test.ts`

End-to-end test: feed a real-ish JSONL fixture through the entire digest pipeline (parser → replay → summarize → store), with a mocked LLM.

- [ ] **Step 1: Write the integration test**

```typescript
// test/integration/digest-pipeline.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runDigest } from '../src/cli/digest.js';
import { DigestStore } from '../src/storage/digest-store.js';
import { parseDigest } from '../src/summarizer/formatter.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: `## What you worked on

You read and edited source files in the project.

## What changed

- Modified \`src/foo.ts\` — updated implementation

## Decisions made

- Chose a simple approach

## Still open

- Nothing noted`,
  }),
}));

let tmpDigestDir: string;

beforeEach(async () => {
  tmpDigestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-integration-'));
});

afterEach(async () => {
  await fs.rm(tmpDigestDir, { recursive: true, force: true });
});

describe('Digest Pipeline Integration', () => {
  it('should produce a valid digest from a JSONL transcript', async () => {
    const fixturePath = path.join(__dirname, '../fixtures/traces/sample-session.jsonl');

    await runDigest({
      transcriptPath: fixturePath,
      sessionId: 'integration-test-session',
      digestDir: tmpDigestDir,
      model: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
    });

    // Verify digest was written
    const files = await fs.readdir(tmpDigestDir);
    expect(files.length).toBe(1);

    // Verify digest is parseable
    const content = await fs.readFile(path.join(tmpDigestDir, files[0]), 'utf-8');
    const { metadata, body } = parseDigest(content);

    expect(metadata.sessionId).toBe('integration-test-session');
    expect(metadata.model).toBe('claude-haiku-4-5-20251001');
    expect(body).toContain('## What you worked on');
    expect(body).toContain('## What changed');
  });

  it('should be idempotent', async () => {
    const fixturePath = path.join(__dirname, '../fixtures/traces/sample-session.jsonl');

    await runDigest({
      transcriptPath: fixturePath,
      sessionId: 'idem-session',
      digestDir: tmpDigestDir,
      model: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
    });

    await runDigest({
      transcriptPath: fixturePath,
      sessionId: 'idem-session',
      digestDir: tmpDigestDir,
      model: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
    });

    const files = await fs.readdir(tmpDigestDir);
    expect(files.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `npx vitest run test/integration/digest-pipeline.test.ts`
Expected: PASS (all modules wired together correctly)

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add test/integration/digest-pipeline.test.ts
git commit -m "test: add end-to-end digest pipeline integration test"
```

---

## Task 17: Transcript Discovery (Recap Fallback)

**Files:**
- Create: `src/cli/transcript-discovery.ts`
- Test: `test/cli/transcript-discovery.test.ts`

Implements the fallback logic for finding undigested transcripts across all Claude Code projects.

- [ ] **Step 1: Write the failing test**

```typescript
// test/cli/transcript-discovery.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { discoverUndigestedSessions } from '../src/cli/transcript-discovery.js';
import { DigestStore } from '../src/storage/digest-store.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let tmpTranscriptDir: string;
let tmpDigestDir: string;

beforeEach(async () => {
  tmpTranscriptDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-transcripts-'));
  tmpDigestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-digests-'));

  // Create a fake project directory with transcripts
  const projectDir = path.join(tmpTranscriptDir, 'C--Users-Eric-Repos-project');
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(
    path.join(projectDir, 'aaaa-bbbb-cccc-dddd.jsonl'),
    '{"type":"user","timestamp":"2026-03-28T10:00:00Z","sessionId":"aaaa-bbbb-cccc-dddd","message":{"role":"user","content":"hello"}}\n{"type":"last-prompt","lastPrompt":"hello","sessionId":"aaaa-bbbb-cccc-dddd"}\n'
  );
});

afterEach(async () => {
  await fs.rm(tmpTranscriptDir, { recursive: true, force: true });
  await fs.rm(tmpDigestDir, { recursive: true, force: true });
});

describe('isSessionComplete', () => {
  it('should return true when last line is last-prompt', async () => {
    const projectDir = path.join(tmpTranscriptDir, 'C--Users-Eric-Repos-project');
    const filePath = path.join(projectDir, 'complete-session.jsonl');
    await fs.writeFile(filePath, [
      '{"type":"user","sessionId":"complete-session","message":{"role":"user","content":"hi"}}',
      '{"type":"assistant","sessionId":"complete-session","message":{"role":"assistant","content":"hello"}}',
      '{"type":"last-prompt","lastPrompt":"hi","sessionId":"complete-session"}',
    ].join('\n') + '\n');

    const { isSessionComplete } = await import('../src/cli/transcript-discovery.js');
    expect(await isSessionComplete(filePath)).toBe(true);
  });

  it('should return true when session has /exit farewell', async () => {
    const projectDir = path.join(tmpTranscriptDir, 'C--Users-Eric-Repos-project');
    const filePath = path.join(projectDir, 'exited-session.jsonl');
    await fs.writeFile(filePath, [
      '{"type":"user","sessionId":"exited-session","message":{"role":"user","content":"hi"}}',
      '{"type":"user","sessionId":"exited-session","message":{"role":"user","content":[{"type":"text","text":"<local-command-stdout>Goodbye!</local-command-stdout>"}]}}',
    ].join('\n') + '\n');

    const { isSessionComplete } = await import('../src/cli/transcript-discovery.js');
    expect(await isSessionComplete(filePath)).toBe(true);
  });

  it('should return false when last line is progress', async () => {
    const projectDir = path.join(tmpTranscriptDir, 'C--Users-Eric-Repos-project');
    const filePath = path.join(projectDir, 'active-session.jsonl');
    await fs.writeFile(filePath, [
      '{"type":"user","sessionId":"active-session","message":{"role":"user","content":"hi"}}',
      '{"type":"progress","sessionId":"active-session"}',
    ].join('\n') + '\n');

    const { isSessionComplete } = await import('../src/cli/transcript-discovery.js');
    expect(await isSessionComplete(filePath)).toBe(false);
  });
});

describe('discoverUndigestedSessions', () => {
  it('should find transcripts without digests', async () => {
    const results = await discoverUndigestedSessions({
      transcriptDir: tmpTranscriptDir,
      digestDir: tmpDigestDir,
      sinceMs: 24 * 60 * 60 * 1000,
      maxSessions: 10,
    });
    expect(results.length).toBe(1);
    expect(results[0].sessionId).toBe('aaaa-bbbb-cccc-dddd');
  });

  it('should skip already-digested sessions', async () => {
    const store = new DigestStore(tmpDigestDir);
    await store.write({
      sessionId: 'aaaa-bbbb-cccc-dddd',
      timestamp: new Date().toISOString(),
      durationMinutes: 10,
      model: 'haiku',
      workingDirectory: '/project',
    }, 'Already digested');

    const results = await discoverUndigestedSessions({
      transcriptDir: tmpTranscriptDir,
      digestDir: tmpDigestDir,
      sinceMs: 24 * 60 * 60 * 1000,
      maxSessions: 10,
    });
    expect(results.length).toBe(0);
  });

  it('should respect maxSessions cap', async () => {
    const projectDir = path.join(tmpTranscriptDir, 'C--Users-Eric-Repos-project');
    // Add more transcripts
    for (let i = 0; i < 15; i++) {
      const id = `sess-${i.toString().padStart(4, '0')}-0000-0000`;
      await fs.writeFile(
        path.join(projectDir, `${id}.jsonl`),
        `{"type":"user","timestamp":"2026-03-28T10:00:00Z","sessionId":"${id}","message":{"role":"user","content":"hi"}}\n{"type":"last-prompt","lastPrompt":"hi","sessionId":"${id}"}\n`
      );
    }

    const results = await discoverUndigestedSessions({
      transcriptDir: tmpTranscriptDir,
      digestDir: tmpDigestDir,
      sinceMs: 24 * 60 * 60 * 1000,
      maxSessions: 5,
    });
    expect(results.length).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/cli/transcript-discovery.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the transcript discovery module**

`discoverUndigestedSessions(options)`:
1. List directories under `transcriptDir` (each is a mangled project path)
2. Glob `*.jsonl` in each project directory
3. Extract session ID from filename (strip `.jsonl`)
4. Check file mtime — skip if older than `sinceMs`
5. Check `DigestStore.exists(sessionId)` — skip if already digested
6. Check session completion: read the last ~5 lines of the JSONL file using `isSessionComplete()`. Only include sessions where the tail contains `"type": "last-prompt"` or an `/exit` farewell pattern. Skip files ending in `"type": "progress"` or lacking these markers.
7. Return up to `maxSessions` results as `{ sessionId, transcriptPath, projectDir }[]`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/cli/transcript-discovery.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/transcript-discovery.ts test/cli/transcript-discovery.test.ts
git commit -m "feat: add transcript discovery for recap fallback"
```

---

## Task 18: Wire Recap Fallback + Final Integration

**Files:**
- Modify: `src/cli/recap.ts`
- Test: `test/integration/recap-fallback.test.ts`

Wire the transcript discovery into the recap command's fallback path.

- [ ] **Step 1: Write the integration test**

```typescript
// test/integration/recap-fallback.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runRecap } from '../src/cli/recap.js';
import { DigestStore } from '../src/storage/digest-store.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock spawn at top level — Vitest hoists vi.mock calls
vi.mock('child_process', () => ({
  spawn: vi.fn().mockReturnValue({ unref: vi.fn() }),
}));

let tmpDigestDir: string;
let tmpTranscriptDir: string;

beforeEach(async () => {
  tmpDigestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-recap-fb-'));
  tmpTranscriptDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-trans-fb-'));
});

afterEach(async () => {
  await fs.rm(tmpDigestDir, { recursive: true, force: true });
  await fs.rm(tmpTranscriptDir, { recursive: true, force: true });
});

describe('Recap with Fallback', () => {
  it('should report undigested sessions without blocking', async () => {
    // Create an undigested transcript
    const projectDir = path.join(tmpTranscriptDir, 'C--project');
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, 'undigested-session.jsonl'),
      '{"type":"user","timestamp":"' + new Date().toISOString() + '","sessionId":"undigested-session","message":{"role":"user","content":"hi"}}\n'
    );

    const output = await runRecap({
      digestDir: tmpDigestDir,
      transcriptDir: tmpTranscriptDir,
      since: '24h',
      maxLength: 20000,
      maxFallbackDigests: 10,
    });

    // Should mention background digests
    expect(output).toContain('being digested in the background');
  });

  it('should show existing digests alongside fallback note', async () => {
    const store = new DigestStore(tmpDigestDir);
    await store.write({
      sessionId: 'existing',
      timestamp: new Date().toISOString(),
      durationMinutes: 20,
      model: 'haiku',
      workingDirectory: '/project',
    }, '## What you worked on\n\nYou built something.');

    const output = await runRecap({
      digestDir: tmpDigestDir,
      since: '24h',
      maxLength: 20000,
    });

    expect(output).toContain('You built something.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/integration/recap-fallback.test.ts`
Expected: FAIL

- [ ] **Step 3: Wire fallback into recap**

Update `runRecap` in `src/cli/recap.ts` to:
1. Call `discoverUndigestedSessions()` if `transcriptDir` is provided
2. For each undigested session, spawn `harness-mem digest <path>` as detached process
3. Include note in output: "N sessions are being digested in the background."
4. Continue with normal digest query and concatenation

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/integration/recap-fallback.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/cli/recap.ts test/integration/recap-fallback.test.ts
git commit -m "feat: wire transcript discovery fallback into recap command"
```

---

## Task 19: Final Polish

**Files:**
- Modify: `package.json` (verify bin works)
- Modify: `bin/harness-mem.ts`

- [ ] **Step 1: Verify the CLI runs**

```bash
npx tsx bin/harness-mem.ts --help
```

Expected: Shows usage with `digest`, `recap`, `clean` commands

- [ ] **Step 2: Verify digest command with sample fixture**

```bash
echo '{"session_id":"test","transcript_path":"test/fixtures/traces/sample-session.jsonl"}' | npx tsx bin/harness-mem.ts digest
```

Expected: Silent success (or mock error if no API key — that's fine, proves the pipeline wires up)

- [ ] **Step 3: Verify recap command**

```bash
npx tsx bin/harness-mem.ts recap --since 24h
```

Expected: "No recent sessions found." or digest output

- [ ] **Step 4: Verify clean command**

```bash
npx tsx bin/harness-mem.ts clean --dry-run
```

Expected: "0 digests would be deleted" or similar

- [ ] **Step 5: Run full test suite one final time**

```bash
npx vitest run
```

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: finalize CLI wiring and verify commands"
```
