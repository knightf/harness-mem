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

  return { deleted: count, wouldDelete: 0 };
}
