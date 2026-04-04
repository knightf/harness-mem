import type { Logger } from 'pino';
import { DigestStore } from '../storage/digest-store.js';
import { parseDuration } from '../engine/utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CleanOptions {
  digestDir: string;
  olderThan: string;
  before?: string;
  dryRun?: boolean;
  logger?: Logger;
}

interface CleanResult {
  deleted: number;
  wouldDelete: number;
}

// ─── runClean ─────────────────────────────────────────────────────────────────

export async function runClean(options: CleanOptions): Promise<CleanResult> {
  const { logger } = options;
  const store = new DigestStore(options.digestDir);

  logger?.debug({ olderThan: options.olderThan, before: options.before, dryRun: options.dryRun }, 'cleaning digests');
  const count = await store.clean({
    olderThanMs: parseDuration(options.olderThan),
    beforeDate: options.before ? new Date(options.before) : undefined,
    dryRun: options.dryRun,
  });

  if (options.dryRun) {
    return { deleted: 0, wouldDelete: count };
  }

  // Rebuild JSONL index after deleting old digests
  if (count > 0) {
    const { indexed, skipped } = await store.rebuildIndex();
    logger?.info({ indexed, skipped }, 'rebuilt constraint index');
    if (skipped > 0) {
      logger?.warn({ skipped }, 'skipped legacy/unparseable digests during index rebuild');
    }
  }

  return { deleted: count, wouldDelete: 0 };
}
