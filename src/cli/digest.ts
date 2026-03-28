import { TraceParser } from '../parser/trace-parser.js';
import { ScopeEngine } from '../engine/scope-engine.js';
import { ToolClusterDetector } from '../engine/boundary.js';
import { ReplayIterator } from '../engine/replay.js';
import { Summarizer } from '../summarizer/summarizer.js';
import { DigestStore } from '../storage/digest-store.js';

// ─── DigestOptions ────────────────────────────────────────────────────────────

export interface DigestOptions {
  transcriptPath: string;
  sessionId: string;
  digestDir: string;
  model: string;
  provider: string;
  force?: boolean;
}

// ─── runDigest ────────────────────────────────────────────────────────────────

export async function runDigest(options: DigestOptions): Promise<void> {
  const { transcriptPath, sessionId, digestDir, model, provider, force = false } = options;

  // 0. Validate required input
  if (!transcriptPath) {
    throw new Error('No transcript path provided. Pass a path as argument or pipe hook JSON via stdin.');
  }
  if (!sessionId) {
    throw new Error('No session ID provided. Pass a transcript file (session ID is extracted from filename) or pipe hook JSON via stdin.');
  }

  // 1. Create DigestStore
  const store = new DigestStore(digestDir);

  // 2. Check if digest already exists for this session
  if (!force && (await store.exists(sessionId))) {
    return;
  }

  // 3. Parse transcript
  const parser = new TraceParser();
  const raw = await parser.parseRaw(transcriptPath);

  // 4. Decompose into structured trace events
  const events = parser.decompose(raw);

  // 5. Extract metadata (startTime, endTime, cwd, etc.)
  const traceMeta = parser.extractMetadata(raw);

  // 6. Compute duration in minutes
  let durationMinutes = 0;
  if (traceMeta.startTime && traceMeta.endTime) {
    const startMs = Date.parse(traceMeta.startTime);
    const endMs = Date.parse(traceMeta.endTime);
    if (!isNaN(startMs) && !isNaN(endMs)) {
      durationMinutes = Math.round((endMs - startMs) / 60000);
    }
  }

  // 7. Create scope engine, detector, and replay iterator
  const engine = new ScopeEngine({ maxFrameDepth: 50 }, traceMeta.cwd || process.cwd());
  const detector = new ToolClusterDetector();
  const iterator = new ReplayIterator(events, engine, detector);

  // 8. Run full replay
  await iterator.runAll();

  // 9. Resolve context with a large budget to capture everything for summarization
  const resolved = engine.resolve(100000);

  // 10. Summarize via LLM
  const summarizer = new Summarizer({ model, provider });
  const summary = await summarizer.summarize(resolved);

  // 11. Build digest metadata
  const digestMeta = {
    sessionId,
    timestamp: traceMeta.endTime || new Date().toISOString(),
    durationMinutes,
    model,
    workingDirectory: traceMeta.cwd || '',
  };

  // 12. Write digest to store
  await store.write(digestMeta, summary);
}
