import type { Logger } from 'pino';
import { RESOLVE_ALL_BUDGET } from '../engine/constants.js';
import { TraceParser } from '../parser/trace-parser.js';
import { ScopeEngine } from '../engine/scope-engine.js';
import { ToolClusterDetector } from '../engine/boundary.js';
import { ReplayIterator } from '../engine/replay.js';
import { Summarizer } from '../summarizer/summarizer.js';
import { DigestStore } from '../storage/digest-store.js';
import { PROVIDER_REGISTRY } from '../summarizer/providers.js';
import type { ProviderKey } from '../engine/types.js';

// ─── DigestOptions ────────────────────────────────────────────────────────────

export interface DigestOptions {
  transcriptPath: string;
  sessionId: string;
  digestDir: string;
  model?: string;
  provider: ProviderKey;
  force?: boolean;
  logger?: Logger;
}

// ─── runDigest ────────────────────────────────────────────────────────────────

export async function runDigest(options: DigestOptions): Promise<void> {
  const { transcriptPath, sessionId, digestDir, model, provider, force = false, logger } = options;

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
    logger?.debug({ sessionId }, 'digest already exists, skipping');
    return;
  }

  // 3. Parse transcript
  const parser = new TraceParser();
  const raw = await parser.parseRaw(transcriptPath);
  logger?.debug({ transcriptPath, lineCount: raw.length }, 'parsed transcript');

  // 4. Decompose into structured trace events
  const events = parser.decompose(raw);
  logger?.debug({ eventCount: events.length }, 'decomposed trace events');

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
  const resolved = engine.resolve(RESOLVE_ALL_BUDGET);
  logger?.debug({ entryCount: resolved.entries.length, artifactCount: resolved.artifacts.length }, 'resolved context');

  // 10. Summarize via LLM
  const providerDef = PROVIDER_REGISTRY[provider];
  if (!providerDef) {
    throw new Error(`Unknown provider '${provider}'. Supported: ${Object.keys(PROVIDER_REGISTRY).join(', ')}`);
  }
  const resolvedModel = model || providerDef.defaultModel;
  logger?.info({ model: resolvedModel, provider }, 'calling LLM for summarization');
  const summarizer = new Summarizer({ model, provider });
  const summary = await summarizer.summarize(resolved);
  logger?.info({ summaryLength: summary.length }, 'LLM summarization complete');

  // 11. Build digest metadata
  const digestMeta = {
    sessionId,
    timestamp: traceMeta.endTime || new Date().toISOString(),
    durationMinutes,
    model: resolvedModel,
    workingDirectory: traceMeta.cwd || '',
  };

  // 12. Write digest to store
  await store.write(digestMeta, summary);
  logger?.info({ sessionId, digestDir }, 'digest written');
}
