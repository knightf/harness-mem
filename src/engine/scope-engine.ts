import { generateId } from './utils.js';
import { DecayEngine, GarbageCollector } from './decay.js';
import { SideEffectStore } from './side-effects.js';
import type {
  Artifact,
  BoundarySignal,
  ContextEntry,
  ContextFrame,
  DecayPolicy,
  ResolvedContext,
  ScopeEngineConfig,
} from './types.js';

// ─── ScopeEngine ─────────────────────────────────────────────────────────────

const CURRENT_FRAME_BOOST = 1.5;

export class ScopeEngine {
  private readonly config: ScopeEngineConfig;
  private readonly frameStack: ContextFrame[] = [];
  private readonly entryRegistry: Map<string, ContextEntry> = new Map();
  private readonly sideEffectStore: SideEffectStore;
  private readonly decayEngine: DecayEngine;
  private readonly gc: GarbageCollector;

  constructor(config: ScopeEngineConfig, workingDir: string) {
    this.config = config;
    this.sideEffectStore = new SideEffectStore(workingDir);
    this.decayEngine = new DecayEngine();
    this.gc = new GarbageCollector(this.decayEngine);

    // Create root frame
    const rootFrame: ContextFrame = {
      id: generateId(),
      parentId: null,
      entries: [],
      captures: [],
      boundary: { type: 'explicit', confidence: 1.0 },
      status: 'active',
    };
    this.frameStack.push(rootFrame);
  }

  /**
   * Push a new frame onto the stack triggered by the given boundary signal.
   * If at maxFrameDepth, pop the oldest (bottom) frame first.
   */
  pushFrame(signal: BoundarySignal): void {
    if (this.frameStack.length >= this.config.maxFrameDepth) {
      // Pop the oldest (bottom) frame
      const oldest = this.frameStack.shift()!;
      oldest.status = 'completed';
    }

    const currentFrame = this.frameStack[this.frameStack.length - 1];
    const newFrame: ContextFrame = {
      id: generateId(),
      parentId: currentFrame?.id ?? null,
      entries: [],
      captures: [],
      boundary: signal,
      status: 'active',
    };
    this.frameStack.push(newFrame);
  }

  /**
   * Mark the current (top) frame as completed and pop it from the stack.
   * Will not pop the last remaining frame.
   */
  popFrame(): void {
    if (this.frameStack.length <= 1) return;
    const popped = this.frameStack.pop()!;
    popped.status = 'completed';
  }

  /**
   * Add a new entry to the current frame.
   * Returns the generated entry ID.
   */
  addEntry(partial: {
    type: ContextEntry['type'];
    content: unknown;
    tokenEstimate: number;
    decayPolicy: DecayPolicy;
    references?: string[];
    metadata?: Record<string, unknown>;
  }): string {
    const currentFrame = this.frameStack[this.frameStack.length - 1];
    const entry: ContextEntry = {
      id: generateId(),
      frameId: currentFrame.id,
      type: partial.type,
      content: partial.content,
      tokenEstimate: partial.tokenEstimate,
      createdAt: Date.now(),
      decayPolicy: partial.decayPolicy,
      references: partial.references ?? [],
      metadata: partial.metadata ?? {},
    };

    this.entryRegistry.set(entry.id, entry);
    currentFrame.entries.push(entry);
    return entry.id;
  }

  /**
   * Record a side effect artifact.
   */
  recordSideEffect(artifact: Artifact): void {
    this.sideEffectStore.record(artifact);
  }

  /**
   * Resolve the current context within the given token budget.
   * Entries in the current frame get a scoring boost.
   * Returns entries sorted by score until budget is exhausted.
   */
  resolve(budget: number): ResolvedContext {
    const currentFrame = this.frameStack[this.frameStack.length - 1];
    const allEntries = Array.from(this.entryRegistry.values());

    // Score each entry
    const scored = allEntries.map((entry) => {
      const frameIndex = this.frameStack.findIndex((f) => f.id === entry.frameId);
      const baseScore = this.decayEngine.score(entry, frameIndex >= 0 ? frameIndex : 0);
      // Boost entries in the current frame
      const boost = entry.frameId === currentFrame.id ? CURRENT_FRAME_BOOST : 1.0;
      return { entry, score: baseScore * boost };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Include entries until budget is exhausted
    const included: ContextEntry[] = [];
    let totalTokens = 0;

    for (const { entry } of scored) {
      if (totalTokens + entry.tokenEstimate <= budget) {
        included.push(entry);
        totalTokens += entry.tokenEstimate;
      }
    }

    return {
      entries: included,
      artifacts: this.sideEffectStore.all(),
      totalTokens,
      budget,
      droppedEntries: allEntries.length - included.length,
    };
  }

  /** Return the current (top) frame. */
  getCurrentFrame(): ContextFrame {
    return this.frameStack[this.frameStack.length - 1];
  }

  /** Return the number of frames on the stack. */
  getFrameCount(): number {
    return this.frameStack.length;
  }

  /** Return a copy of the full frame stack. */
  getFrames(): ContextFrame[] {
    return [...this.frameStack];
  }

  /** Return all entries from the registry. */
  getEntries(): ContextEntry[] {
    return Array.from(this.entryRegistry.values());
  }

  /** Run garbage collection: classify entries and remove collected ones. */
  runGC(): void {
    const frameStatusMap = new Map<string, 'active' | 'completed' | 'abandoned'>();
    for (const frame of this.frameStack) {
      frameStatusMap.set(frame.id, frame.status);
    }

    const allEntries = Array.from(this.entryRegistry.values());
    const result = this.gc.classify(allEntries, frameStatusMap);

    // Remove collected entries from registry and their frames
    for (const entry of result.collected) {
      this.entryRegistry.delete(entry.id);
      for (const frame of this.frameStack) {
        const idx = frame.entries.indexOf(entry);
        if (idx >= 0) {
          frame.entries.splice(idx, 1);
          break;
        }
      }
    }
  }
}
