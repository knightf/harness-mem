import { generateId } from './utils.js';
import { RESOLVE_ALL_BUDGET } from './constants.js';
import type { ScopeEngine } from './scope-engine.js';
import type { ToolClusterDetector } from './boundary.js';
import type {
  Artifact,
  ContextEntry,
  ResolvedContext,
  TraceEvent,
  ReplayResult,
} from './types.js';

// ─── Event-type to entry-type mapping ────────────────────────────────────────

function mapEntryType(eventType: TraceEvent['type']): ContextEntry['type'] {
  switch (eventType) {
    case 'tool-call':
    case 'tool-result':
      return 'side-effect';
    default:
      return 'conversational';
  }
}

// ─── ReplayIterator ──────────────────────────────────────────────────────────

export class ReplayIterator {
  private readonly events: TraceEvent[];
  private readonly engine: ScopeEngine;
  private readonly detector: ToolClusterDetector;

  private index = 0;
  private readonly processedEntries: ContextEntry[] = [];
  private readonly resolutions: ResolvedContext[] = [];
  private readonly sideEffects: Artifact[] = [];

  constructor(events: TraceEvent[], engine: ScopeEngine, detector: ToolClusterDetector) {
    this.events = events;
    this.engine = engine;
    this.detector = detector;
  }

  hasNext(): boolean {
    return this.index < this.events.length;
  }

  async next(): Promise<void> {
    if (!this.hasNext()) return;

    const event = this.events[this.index];

    // Build a ContextEntry from the TraceEvent
    const entry: ContextEntry = {
      id: generateId(),
      frameId: this.engine.getCurrentFrame().id,
      type: mapEntryType(event.type),
      content: event.content,
      tokenEstimate: event.tokenEstimate,
      createdAt: event.timestamp,
      decayPolicy: { strategy: 'none' },
      references: [],
      metadata: event.metadata ?? {},
    };

    // Boundary detection
    const signal = await this.detector.detect(entry, this.processedEntries);
    if (signal) {
      this.engine.pushFrame(signal);
      // Update frameId to the new current frame
      entry.frameId = this.engine.getCurrentFrame().id;
    }

    // Add entry to engine
    this.engine.addEntry({
      type: entry.type,
      content: entry.content,
      tokenEstimate: entry.tokenEstimate,
      decayPolicy: entry.decayPolicy,
      references: entry.references,
      metadata: entry.metadata,
    });

    // Record side effects
    if (event.sideEffect?.hasSideEffect) {
      for (const p of event.sideEffect.paths) {
        const artifact: Artifact = {
          id: generateId(),
          type: 'file',
          location: p,
          state: event.content,
          createdAt: event.timestamp,
        };
        this.engine.recordSideEffect(artifact);
        this.sideEffects.push(artifact);
      }
    }

    // Record resolution at user-message and tool-result events
    if (event.type === 'user-message' || event.type === 'tool-result') {
      const resolved = this.engine.resolve(RESOLVE_ALL_BUDGET);
      this.resolutions.push(resolved);
    }

    this.processedEntries.push(entry);
    this.index++;
  }

  /** Resolve the current scope (large budget snapshot). */
  inspect(): ResolvedContext {
    return this.engine.resolve(RESOLVE_ALL_BUDGET);
  }

  /** Process all remaining events and return the replay result. */
  async runAll(): Promise<ReplayResult> {
    while (this.hasNext()) {
      await this.next();
    }

    return {
      frames: this.engine.getFrames(),
      resolutions: this.resolutions,
      sideEffects: this.sideEffects,
      timeline: [],
    };
  }
}
