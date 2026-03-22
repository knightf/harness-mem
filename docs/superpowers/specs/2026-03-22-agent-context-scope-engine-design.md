# Agent Context Scope Engine — Design Spec

## Overview

A TypeScript library that manages agent context using a runtime scoping model inspired by JavaScript's execution semantics. Instead of predefined context layers (system/project/session), context is managed through a dynamic frame stack where steps emerge at runtime, scope resolution walks the frame chain, and garbage collection with compaction keeps context within token budgets.

The goal is a **universal, agent-type-agnostic** solution for context management — applicable to coding agents, research agents, conversational agents, or any agent that works toward goals through multi-step processes.

## Problem Statement

Current agent frameworks handle context in one of two ways, both inadequate:

- **Over-structured** (e.g., LangGraph): Context flows along predefined graph edges. If the agent needs to do something unanticipated, the structure can't adapt.
- **Under-structured** (e.g., ReAct loops): All context accumulates in a flat list. No scoping — the context window fills up and critical information gets lost.

The core insight is that **context management is a scoping problem**. Just as JavaScript manages variable visibility through a scope chain — where inner functions see outer variables and closures capture specific bindings — agent context can be managed through analogous mechanics: frames for steps, a scope chain for resolution, and garbage collection for cleanup.

The key challenge: unlike JavaScript where the programmer defines functions ahead of time, **agent steps emerge dynamically**. The engine must discover frame boundaries at runtime.

## Core Mental Model

| JS Concept | Agent Context Equivalent |
|---|---|
| Call stack | Chain of steps the agent takes toward a goal |
| Stack frame | `ContextFrame` — context produced during one logical step |
| Scope chain | Resolution path: walk up the frame chain to find accessible context |
| Heap | `SideEffectStore` — external world state (files, drafts, DB changes) |
| Closure | A frame that captures specific context from parent frames |
| Garbage collection | Relevance decay — determines when context is no longer worth keeping |

### Three Context Dimensions

1. **Conversational flow** — the inputs driving the process: agent actions (tool calls, reasoning) and user inputs (direction changes, corrections, new goals). Lives in stack frames.
2. **Side effects** — changes to the external world as a result of the conversation: files created/edited, drafts produced, API calls made, database changes. Lives in the heap (`SideEffectStore`).
3. **Cross-session persistence** — context that survives between separate agent runs: memories, learned preferences, project knowledge. Module-level state that persists across call stacks.

### Relevance Decay as Cross-Cutting Property

Decay is not a fourth dimension — it is a property that modulates all three dimensions:

- **Conversational entries** decay based on distance and access patterns
- **Side effect entries** decay based on staleness (has the artifact been updated since?)
- **Cross-session entries** decay based on validation against current session evidence

## Data Structures

### ContextEntry

A single piece of context, regardless of which dimension it comes from.

```typescript
interface ContextEntry {
  id: string
  type: 'conversational' | 'side-effect' | 'cross-session'
  content: unknown
  createdAt: number
  decay: DecayPolicy
  references: string[]       // IDs of other entries this one depends on
  metadata: Record<string, unknown>
}
```

### DecayPolicy

Controls how an entry ages over time.

```typescript
interface DecayPolicy {
  strategy: 'none' | 'linear' | 'step' | 'custom'
  halfLife?: number
  retainUntil?: string
  score: (age: number, accessCount: number) => number
}
```

### ContextFrame

A stack frame — context produced during one logical step.

```typescript
interface ContextFrame {
  id: string
  parentId: string | null
  entries: ContextEntry[]
  captures: string[]         // entry IDs captured from parent frames (closures)
  boundary: BoundarySignal
  status: 'active' | 'completed' | 'abandoned'
}
```

### BoundarySignal

What caused a new frame to be pushed.

```typescript
interface BoundarySignal {
  type: 'user-input' | 'goal-shift' | 'tool-cluster' | 'explicit'
  description: string
  confidence: number         // 0-1
}
```

### SideEffectStore and Artifacts

The heap — world state outside the conversation.

```typescript
interface SideEffectStore {
  artifacts: Map<string, Artifact>
}

interface Artifact {
  id: string
  location: string           // file path, URL, DB key, etc.
  snapshots: ArtifactSnapshot[]
  currentState: unknown
}

interface ArtifactSnapshot {
  frameId: string
  timestamp: number
  state: unknown
}
```

## Scope Engine

The engine has three core responsibilities: frame management, scope resolution, and decay/garbage collection.

```typescript
interface ScopeEngine {
  // Frame management
  pushFrame(signal: BoundarySignal): ContextFrame
  popFrame(frameId: string): void
  getCurrentFrame(): ContextFrame
  addEntry(entry: ContextEntry): void
  capture(entryIds: string[]): void

  // Scope resolution
  resolve(): ResolvedContext

  // Side effects
  recordSideEffect(artifact: Artifact): void
  getArtifact(location: string): Artifact | null

  // Decay / GC
  gc(): void
}

interface ResolvedContext {
  entries: ContextEntry[]
  artifacts: Artifact[]
  totalTokens: number
  budget: number
  dropped: ContextEntry[]
}
```

### Scope Resolution Algorithm

1. Start at the current frame
2. Walk up the parent chain (scope chain traversal)
3. At each frame, collect entries + captured entries
4. Query the `SideEffectStore` for current artifact states
5. Pull in cross-session entries (module-level imports)
6. Apply decay scoring to everything collected
7. Rank by relevance score, fit within token budget
8. Return `ResolvedContext`

## Boundary Detection — Hybrid Approach

Boundary detection uses a **hybrid strategy**: heuristics for structural boundaries (tool clusters) and LLM for semantic boundaries (user intent, goal shifts).

### Detector Interface

```typescript
interface BoundaryDetector {
  analyze(
    currentFrame: ContextFrame,
    newActivity: ContextEntry[]
  ): Promise<BoundarySignal | null>
}
```

### ToolClusterDetector (Heuristic)

Groups related tool calls by type, timing, and target. Fires a boundary when the cluster ends (different tool type, long pause, different target). Fast, deterministic, no LLM cost.

### SemanticBoundaryDetector (LLM-Powered)

Uses a lightweight LLM call to assess:

1. Does this user input represent a continuation or a direction change?
2. Has the agent's goal shifted based on what it just learned?

The prompt is minimal: current frame's intent summary + new activity. Not the full context. Keeps LLM calls cheap and fast.

### HybridBoundaryDetector (Composite)

```typescript
class HybridBoundaryDetector implements BoundaryDetector {
  private heuristic: ToolClusterDetector
  private semantic: SemanticBoundaryDetector

  async analyze(currentFrame, newActivity): Promise<BoundarySignal | null> {
    // 1. Heuristic first (cheap, instant)
    const heuristicResult = await this.heuristic.analyze(currentFrame, newActivity)

    // 2. Semantic runs when: user input present OR heuristic detected boundary
    const needsSemantic = hasUserInput(newActivity) || heuristicResult !== null

    if (needsSemantic) {
      const semanticResult = await this.semantic.analyze(currentFrame, newActivity)
      return this.merge(heuristicResult, semanticResult)
    }

    return heuristicResult
  }
}
```

**Merge logic:**

- Semantic takes precedence for `user-input` and `goal-shift` types
- Heuristic takes precedence for `tool-cluster` type
- If both fire, higher confidence wins
- If semantic says "no boundary" but heuristic says "cluster ended", still push frame (structural boundaries are independent of semantic ones)

## Decay & Garbage Collection

### DecayEngine

```typescript
interface DecayEngine {
  score(entry: ContextEntry, now: number, accessLog: AccessLog): number
  collect(
    frames: ContextFrame[],
    sideEffects: SideEffectStore,
    budget: number
  ): GCResult
}

interface AccessLog {
  lastAccessed: Map<string, number>
  accessCount: Map<string, number>
}

interface GCResult {
  retained: ContextEntry[]
  collected: ContextEntry[]
  compacted: ContextEntry[]
}
```

### Three GC Strategies

1. **Retain** — entry is still relevant, keep as-is
2. **Collect** — entry is no longer relevant, remove entirely
3. **Compact** — entry has decayed but contains potentially useful information. Summarize into a shorter form via LLM and keep the summary. Analogous to Claude Code's context compression.

### Compactor

```typescript
interface Compactor {
  compact(entries: ContextEntry[]): Promise<ContextEntry>
}
```

Multiple entries can be compacted together into a single summary entry. The summary inherits the highest decay score of its sources and starts its own decay lifecycle.

### Dimension-Specific Decay Behavior

- **Conversational entries** — decay based on distance (how many frames ago) and access (was this referenced since?). Early reasoning steps decay fast; user goal statements decay slowly.
- **Side effect entries** — decay based on staleness. If the artifact has been updated since, older snapshots decay. Current state never decays.
- **Cross-session entries** — decay based on validation. Entries confirmed by current session evidence get refreshed; entries contradicting current state get flagged for collection.

## Trace Ingestion — Test Harness

To validate the engine against real agent behavior, the PoC includes a trace replay system that ingests Claude Code conversation exports.

### Trace Types

```typescript
interface TraceEvent {
  type: 'user-message' | 'assistant-message' | 'tool-call' | 'tool-result' | 'system-reminder'
  timestamp: number
  content: unknown
  toolName?: string
  toolParams?: unknown
}

interface ReplayResult {
  frames: ContextFrame[]
  resolutions: ResolvedContext[]
  timeline: TimelineEntry[]
}

interface TimelineEntry {
  frameId: string
  boundary: BoundarySignal
  entriesAdded: number
  entriesInScope: number
  entriesDropped: number
  tokensUsed: number
  artifactsChanged: string[]
}
```

### Replay Process

1. Parse Claude Code conversation export into `TraceEvent[]`
2. Feed events to `HybridBoundaryDetector` one by one
3. When a boundary is detected, engine pushes a new frame
4. Each event becomes a `ContextEntry` in the current frame
5. Tool calls that modify files get recorded in `SideEffectStore`
6. At each step, run `resolve()` and record what would have been in scope
7. Output `ReplayResult` with full timeline

### Validation Criteria

- Did the engine identify sensible step boundaries?
- At any given step, was the right context in scope?
- Did the GC drop things that were actually needed later?
- Did compaction preserve essential information?

## Project Structure

```
harness/
├── src/
│   ├── core/
│   │   ├── types.ts              # All interfaces
│   │   ├── scope-engine.ts       # ScopeEngine implementation
│   │   └── scope-chain.ts        # Frame stack + scope resolution logic
│   ├── boundary/
│   │   ├── detector.ts           # BoundaryDetector interface
│   │   ├── tool-cluster.ts       # ToolClusterDetector (heuristic)
│   │   ├── semantic.ts           # SemanticBoundaryDetector (LLM-powered)
│   │   └── hybrid.ts             # HybridBoundaryDetector (composite)
│   ├── decay/
│   │   ├── decay-engine.ts       # DecayEngine + scoring
│   │   ├── policies.ts           # Built-in decay policies
│   │   ├── compactor.ts          # LLM-powered compaction
│   │   └── gc.ts                 # Garbage collector
│   ├── side-effects/
│   │   └── store.ts              # SideEffectStore + Artifact tracking
│   ├── trace/
│   │   ├── adapter.ts            # TraceAdapter — parse Claude Code exports
│   │   ├── replay.ts             # Replay engine
│   │   └── timeline.ts           # TimelineEntry generation
│   └── index.ts                  # Public API
├── test/
│   ├── fixtures/
│   │   └── traces/               # Sample Claude Code conversation exports
│   ├── core/
│   ├── boundary/
│   ├── decay/
│   └── trace/
├── package.json
├── tsconfig.json
└── README.md
```

## Technology

- **Language:** TypeScript (Node.js)
- **LLM dependency:** Required for `SemanticBoundaryDetector` and `Compactor`. Should be provider-agnostic (abstract LLM interface, concrete implementations for Claude, OpenAI, etc.)
- **Testing:** Real Claude Code conversation exports as fixtures

## Open Questions

1. **Capture heuristics** — when a new frame is pushed, how do we decide which parent entries to capture (closure)? This likely needs LLM assistance as well.
2. **Token estimation** — how accurately do we need to estimate token costs for budget-aware resolution? A rough approximation may suffice for the PoC.
3. **Cross-session bootstrap** — how are cross-session entries loaded into the engine at the start of a new session? What format do they persist in?
4. **Trace export format** — what exact format do Claude Code conversation exports use? This needs investigation to build the adapter.
