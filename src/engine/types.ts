// ─── Decay Policy ────────────────────────────────────────────────────────────

export interface DecayPolicy {
  strategy: 'none' | 'linear' | 'step' | 'custom';
  halfLife?: number;
  retainUntil?: string | number;
  customScorer?: (age: number, accessCount: number) => number;
}

// ─── Context Entry & Frame ────────────────────────────────────────────────────

export interface ContextEntry {
  id: string;
  frameId: string;
  type: 'conversational' | 'side-effect' | 'cross-session';
  content: unknown;
  tokenEstimate: number;
  createdAt: number;
  decayPolicy: DecayPolicy;
  references: string[];
  metadata: Record<string, unknown>;
  accessLog?: { lastAccessed: number; accessCount: number };
}

export interface BoundarySignal {
  type: 'user-input' | 'goal-shift' | 'tool-cluster' | 'explicit';
  description?: string;
  confidence: number;
}

export interface ContextFrame {
  id: string;
  parentId: string | null;
  entries: ContextEntry[];
  captures: string[];
  boundary: BoundarySignal;
  status: 'active' | 'completed' | 'abandoned';
}

// ─── Artifacts ───────────────────────────────────────────────────────────────

export interface ArtifactSnapshot {
  frameId: string;
  timestamp: number;
  state: unknown;
}

export interface Artifact {
  id: string;
  type: string;
  location: string;
  state: unknown;
  createdAt: number;
  snapshots?: ArtifactSnapshot[];
}

// ─── Access Log & GC ─────────────────────────────────────────────────────────

export interface AccessLog {
  lastAccessed: Map<string, number>;
  accessCount: Map<string, number>;
}

export interface GCResult {
  retained: ContextEntry[];
  collected: ContextEntry[];
  compacted: ContextEntry[];
}

// ─── Raw Trace (JSONL parsing) ────────────────────────────────────────────────

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
}

export interface RawTraceEntry {
  type: 'user' | 'assistant' | 'tool_result' | 'progress';
  parentUuid: string | null;
  uuid: string;
  timestamp: string;
  sessionId: string;
  message?: { role: string; content: string | ContentBlock[] };
  toolUseID?: string;
  isSidechain?: boolean;
  cwd?: string;
  gitBranch?: string;
}

// ─── Trace Event ─────────────────────────────────────────────────────────────

export interface TraceEvent {
  id: string;
  type: 'user-message' | 'assistant-text' | 'tool-call' | 'tool-result' | 'system-reminder';
  content: unknown;
  timestamp: number;
  tokenEstimate: number;
  metadata?: Record<string, unknown>;
  sideEffect?: { hasSideEffect: boolean; paths: string[] };
}

// ─── Scope Engine ─────────────────────────────────────────────────────────────

export interface ScopeEngineConfig {
  maxFrameDepth: number;
  tokenBudget?: number;
  gcThreshold?: number;
}

export interface ResolvedContext {
  entries: ContextEntry[];
  artifacts: Artifact[];
  totalTokens: number;
  budget: number;
  droppedEntries: number;
}

// ─── Replay ───────────────────────────────────────────────────────────────────

export interface TimelineEntry {
  frameId: string;
  boundary: BoundarySignal;
  entriesAdded: number;
  entriesInScope: number;
  entriesDropped: number;
  tokensUsed: number;
  artifactsChanged: string[];
}

export interface StepResult {
  event: TraceEvent;
  entry: ContextEntry;
  boundaryDetected: BoundarySignal | null;
  framePushed: boolean;
  sideEffectsRecorded: Artifact[];
}

export interface ReplayResult {
  frames: ContextFrame[];
  resolutions: ResolvedContext[];
  sideEffects: Artifact[];
  timeline: TimelineEntry[];
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface TokenEstimator {
  estimate(content: unknown): number;
}

export interface BoundaryDetector {
  analyze(currentFrame: ContextFrame, newActivity: ContextEntry[]): Promise<BoundarySignal | null>;
}

// ─── CLI / Config Types ───────────────────────────────────────────────────────

export interface DigestMetadata {
  sessionId: string;
  timestamp: string;
  durationMinutes: number;
  model: string;
  workingDirectory: string;
}

export interface HarnessMemConfig {
  digestDir: string;
  transcriptDir: string;
  defaultModel?: string;
  defaultProvider: string;
  recap: {
    since: string;
    maxLength: number;
    maxFallbackDigests: number;
  };
  clean: {
    olderThan: string;
  };
}
