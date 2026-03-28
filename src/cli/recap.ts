import { DigestStore } from '../storage/digest-store.js';
import { parseDuration } from '../engine/utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecapOptions {
  digestDir: string;
  since: string;
  maxLength: number;
  transcriptDir?: string;
  maxFallbackDigests?: number;
}

// ─── runRecap ─────────────────────────────────────────────────────────────────

export async function runRecap(options: RecapOptions): Promise<string> {
  const store = new DigestStore(options.digestDir);

  const entries = await store.query({ since: parseDuration(options.since) });

  if (entries.length === 0) {
    return 'No recent sessions found.';
  }

  // Entries are already sorted newest-first by DigestStore.query
  const parts: string[] = [];
  let totalLength = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (totalLength >= options.maxLength) {
      skipped++;
      continue;
    }

    const body = entry.body;

    if (totalLength + body.length > options.maxLength && parts.length > 0) {
      skipped = entries.length - parts.length;
      break;
    }

    parts.push(body);
    totalLength += body.length;
  }

  let result = parts.join('\n\n---\n\n');

  if (skipped > 0) {
    result +=
      `\n\n... and ${skipped} more sessions not shown. Run \`harness-mem recap --no-limit\` to see all.`;
  }

  return result;
}
