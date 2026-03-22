import type {
  BoundaryDetector,
  BoundarySignal,
  ContextEntry,
  ContextFrame,
  ResolvedContext,
  ReplayResult,
  TimelineEntry,
  StepResult,
  TraceEvent,
  ScopeEngineConfig,
  Artifact,
} from '../core/types.js';
import { TraceAdapter } from './adapter.js';
import { ScopeEngineImpl } from '../core/scope-engine.js';
import { generateId } from '../core/utils.js';
import { createDecayPolicy } from '../decay/policies.js';

export class TraceReplayIterator {
  private events: TraceEvent[] = [];
  private index = 0;
  private engine: ScopeEngineImpl;
  private detector: BoundaryDetector;
  private adapter: TraceAdapter;
  private timeline: TimelineEntry[] = [];
  private _frameCount = 1; // root frame

  constructor(
    cwd: string,
    detector: BoundaryDetector,
    config?: ScopeEngineConfig
  ) {
    this.engine = new ScopeEngineImpl(config ?? { frameDepthLimit: 100 }, cwd);
    this.detector = detector;
    this.adapter = new TraceAdapter(cwd);
  }

  async load(jsonlPath: string): Promise<void> {
    this.events = await this.adapter.decompose(jsonlPath);
    this.index = 0;
  }

  eventCount(): number {
    return this.events.length;
  }

  eventIndex(): number {
    return this.index;
  }

  isComplete(): boolean {
    return this.index >= this.events.length;
  }

  currentFrame(): ContextFrame {
    return this.engine.getCurrentFrame();
  }

  frameCount(): number {
    return this._frameCount;
  }

  async next(): Promise<StepResult> {
    const event = this.events[this.index++];

    // Create ContextEntry from TraceEvent
    const entry: ContextEntry = {
      id: generateId(),
      type: 'conversational',
      content: event.content ?? event.toolResult ?? null,
      createdAt: event.timestamp,
      decay: createDecayPolicy('linear', { halfLife: 10000 }),
      references: [],
      metadata: {
        eventType: event.type,
        toolName: event.toolName,
        sourceUuid: event.sourceUuid,
      },
    };

    // Record side effects
    const sideEffectsRecorded: Artifact[] = [];
    if (event.hasSideEffect && event.sideEffectPaths) {
      for (const filePath of event.sideEffectPaths) {
        const artifact: Artifact = {
          id: generateId(),
          location: filePath,
          snapshots: [],
          currentState: event.toolResult ?? 'modified',
        };
        this.engine.recordSideEffect(artifact);
        sideEffectsRecorded.push(artifact);
      }
    }

    // Run boundary detector
    const boundaryDetected = await this.detector.analyze(
      this.engine.getCurrentFrame(),
      [entry]
    );

    let framePushed = false;
    if (boundaryDetected) {
      // Pop current frame and push new one
      const currentFrame = this.engine.getCurrentFrame();
      if (currentFrame.parentId !== null) {
        this.engine.popFrame(currentFrame.id);
      }
      this.engine.pushFrame(boundaryDetected);
      framePushed = true;
      this._frameCount++;
    }

    // Add entry to current frame
    this.engine.addEntry(entry);

    return {
      event,
      entry,
      boundaryDetected,
      framePushed,
      sideEffectsRecorded,
    };
  }

  resolve(budget: number): ResolvedContext {
    return this.engine.resolve(budget);
  }

  async runAll(budget: number): Promise<ReplayResult> {
    const resolutions: ResolvedContext[] = [];

    while (!this.isComplete()) {
      const step = await this.next();

      // Record timeline entry on boundary detection
      if (step.boundaryDetected) {
        const resolved = this.resolve(budget);
        this.timeline.push({
          frameId: this.engine.getCurrentFrame().id,
          boundary: step.boundaryDetected,
          entriesAdded: 1,
          entriesInScope: resolved.entries.length,
          entriesDropped: resolved.dropped.length,
          tokensUsed: resolved.totalTokens,
          artifactsChanged: step.sideEffectsRecorded.map(a => a.location),
        });
      }

      // Resolution points: after user messages and tool results
      if (step.event.type === 'user-message' || step.event.type === 'tool-result') {
        resolutions.push(this.resolve(budget));
      }
    }

    // Collect current frame (at minimum) for the frames array
    const frames = [this.engine.getCurrentFrame()];

    return {
      frames,
      resolutions,
      timeline: this.timeline,
    };
  }
}
