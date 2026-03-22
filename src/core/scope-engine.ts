import type {
  ContextEntry,
  ContextFrame,
  BoundarySignal,
  ScopeEngineConfig,
  ResolvedContext,
  Artifact,
  AccessLog,
} from './types.js';
import { generateId } from './utils.js';
import { SimpleTokenEstimator } from './utils.js';
import { ScopeChain } from './scope-chain.js';
import { SideEffectStoreImpl } from '../side-effects/store.js';
import { DecayEngineImpl } from '../decay/decay-engine.js';
import { GarbageCollector } from '../decay/gc.js';

export class ScopeEngineImpl {
  private frames: Map<string, ContextFrame>;
  private currentFrameId: string;
  private entryRegistry: Map<string, ContextEntry>;
  private crossSessionEntries: ContextEntry[];
  private scopeChain: ScopeChain;
  private sideEffectStore: SideEffectStoreImpl;
  private decayEngine: DecayEngineImpl;
  private tokenEstimator: SimpleTokenEstimator;
  private accessLog: AccessLog;
  private garbageCollector: GarbageCollector;

  constructor(private config: ScopeEngineConfig, private cwd: string) {
    this.frames = new Map();
    this.entryRegistry = new Map();
    this.crossSessionEntries = [];
    this.decayEngine = new DecayEngineImpl();
    this.tokenEstimator = new SimpleTokenEstimator();
    this.garbageCollector = new GarbageCollector(this.decayEngine, this.tokenEstimator);
    this.sideEffectStore = new SideEffectStoreImpl(cwd);
    this.scopeChain = new ScopeChain(this.decayEngine, this.tokenEstimator);
    this.accessLog = {
      lastAccessed: new Map(),
      accessCount: new Map(),
    };

    // Create root frame
    const rootId = generateId();
    const rootFrame: ContextFrame = {
      id: rootId,
      parentId: null,
      entries: [],
      captures: [],
      boundary: { type: 'explicit', description: 'root', confidence: 1 },
      status: 'active',
    };
    this.frames.set(rootId, rootFrame);
    this.currentFrameId = rootId;
  }

  getCurrentFrame(): ContextFrame {
    return this.frames.get(this.currentFrameId)!;
  }

  pushFrame(signal: BoundarySignal): ContextFrame {
    const newId = generateId();
    const newFrame: ContextFrame = {
      id: newId,
      parentId: this.currentFrameId,
      entries: [],
      captures: [],
      boundary: signal,
      status: 'active',
    };
    this.frames.set(newId, newFrame);
    this.currentFrameId = newId;
    return newFrame;
  }

  popFrame(frameId: string): void {
    const frame = this.frames.get(frameId);
    if (!frame) return;
    frame.status = 'completed';
    if (frame.parentId) {
      this.currentFrameId = frame.parentId;
    }
  }

  abandonFrame(frameId: string): void {
    const frame = this.frames.get(frameId);
    if (!frame) return;
    frame.status = 'abandoned';
    for (const entry of frame.entries) {
      entry.metadata.frameStatus = 'abandoned';
    }
    if (frame.parentId) {
      this.currentFrameId = frame.parentId;
    }
  }

  addEntry(entry: ContextEntry): void {
    const current = this.getCurrentFrame();
    current.entries.push(entry);
    this.entryRegistry.set(entry.id, entry);
  }

  capture(entryIds: string[]): void {
    const current = this.getCurrentFrame();
    for (const id of entryIds) {
      current.captures.push(id);
    }
  }

  getEntry(entryId: string): ContextEntry | null {
    return this.entryRegistry.get(entryId) ?? null;
  }

  resolve(budget: number): ResolvedContext {
    const current = this.getCurrentFrame();
    const result = this.scopeChain.resolve(
      current,
      this.frames,
      this.entryRegistry,
      this.crossSessionEntries,
      this.accessLog,
      budget
    );
    result.artifacts = this.sideEffectStore.all();
    return result;
  }

  recordSideEffect(artifact: Artifact): void {
    this.sideEffectStore.record(artifact);
  }

  getArtifact(location: string): Artifact | null {
    return this.sideEffectStore.get(location);
  }

  loadCrossSessionEntries(entries: ContextEntry[]): void {
    this.crossSessionEntries = entries;
  }

  gc(): void {
    const allEntries: ContextEntry[] = [];
    for (const frame of this.frames.values()) {
      allEntries.push(...frame.entries);
    }

    const result = this.garbageCollector.classify(allEntries, Date.now(), this.accessLog);

    const collectedIds = new Set(result.collected.map(e => e.id));
    for (const frame of this.frames.values()) {
      frame.entries = frame.entries.filter(e => !collectedIds.has(e.id));
    }
    for (const id of collectedIds) {
      this.entryRegistry.delete(id);
    }
  }
}
