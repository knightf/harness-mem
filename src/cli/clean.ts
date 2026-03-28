import { DigestStore } from '../storage/digest-store.js';
import { parseDuration } from '../engine/utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CleanOptions {
  digestDir: string;
  olderThan: string;
  before?: string;
  dryRun?: boolean;
}

interface CleanResult {
  deleted: number;
  wouldDelete: number;
}

// ─── runClean ─────────────────────────────────────────────────────────────────

export async function runClean(options: CleanOptions): Promise<CleanResult> {
  const store = new DigestStore(options.digestDir);

  const count = await store.clean({
    olderThanMs: parseDuration(options.olderThan),
    dryRun: options.dryRun,
  });

  if (options.dryRun) {
    return { deleted: 0, wouldDelete: count };
  }

  return { deleted: count, wouldDelete: 0 };
}
