// Decay policy - declares strategy and parameters
export interface DecayPolicy {
  strategy: 'none' | 'linear' | 'step' | 'custom';
  halfLife?: number;
  retainUntil?: string;
  customScorer?: (age: number, accessCount: number) => number;
}

// A single piece of context
export interface ContextEntry {
  id: string;
  type: 'conversational' | 'side-effect' | 'cross-session';
  content: unknown;
  createdAt: number;
  decay: DecayPolicy;
  references: string[];
  metadata: Record<string, unknown>;
}

// A stack frame
export interface ContextFrame {
  id: string;
  parentId: string | null;
  entries: ContextEntry[];
  captures: string[];
  boundary: BoundarySignal;
  status: 'active' | 'completed' | 'abandoned';
}

// What caused a new frame
export interface BoundarySignal {
  type: 'user-input' | 'goal-shift' | 'tool-cluster' | 'explicit';
  description: string;
  confidence: number;
}

// JSON-serializable form of ContextEntry
export interface SerializedEntry {
  id: string;
  type: 'conversational' | 'side-effect' | 'cross-session';
  content: unknown;
  createdAt: number;
  decay: { strategy: string; halfLife?: number; retainUntil?: string };
  references: string[];
  metadata: Record<string, unknown>;
}

// Artifact in the heap
export interface Artifact {
  id: string;
  location: string;
  snapshots: ArtifactSnapshot[];
  currentState: unknown;
}

export interface ArtifactSnapshot {
  frameId: string;
  timestamp: number;
  state: unknown;
}

// SideEffectStore as a type (not class)
export interface SideEffectStore {
  artifacts: Map<string, Artifact>;
}

// Engine config
export interface ScopeEngineConfig {
  frameDepthLimit: number;
}

// Resolution result
export interface ResolvedContext {
  entries: ContextEntry[];
  artifacts: Artifact[];
  totalTokens: number;
  budget: number;
  dropped: ContextEntry[];
}

// Access tracking for decay
export interface AccessLog {
  lastAccessed: Map<string, number>;
  accessCount: Map<string, number>;
}

// GC result
export interface GCResult {
  retained: ContextEntry[];
  collected: ContextEntry[];
  compacted: ContextEntry[];
}

// Raw JSONL line from Claude Code
export interface RawTraceEntry {
  type: 'user' | 'assistant' | 'tool_result' | 'progress';
  parentUuid: string | null;
  uuid: string;
  timestamp: string;
  sessionId: string;
  message?: {
    role: string;
    content: string | ContentBlock[];
  };
  toolUseID?: string;
  isSidechain?: boolean;
  cwd?: string;
  gitBranch?: string;
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
}

// Normalized atomic event
export interface TraceEvent {
  type: 'user-message' | 'assistant-text' | 'tool-call' | 'tool-result' | 'system-reminder';
  timestamp: number;
  content: unknown;
  toolName?: string;
  toolParams?: unknown;
  toolResult?: unknown;
  sourceUuid: string;
  hasSideEffect?: boolean;
  sideEffectPaths?: string[];
}

// Replay results
export interface ReplayResult {
  frames: ContextFrame[];
  resolutions: ResolvedContext[];
  timeline: TimelineEntry[];
}

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

// LLM provider interface
export interface LLMProvider {
  complete(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string>;
}

// Token estimator interface
export interface TokenEstimator {
  estimate(content: unknown): number;
}

// Boundary detector interface
export interface BoundaryDetector {
  analyze(
    currentFrame: ContextFrame,
    newActivity: ContextEntry[]
  ): Promise<BoundarySignal | null>;
}

// Compactor interface
export interface Compactor {
  compact(entries: ContextEntry[]): Promise<ContextEntry>;
}
