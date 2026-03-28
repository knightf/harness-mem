import type { Logger } from 'pino';
import { DigestStore } from '../storage/digest-store.js';
import { parseDuration } from '../engine/utils.js';
import { discoverUndigestedSessions } from './transcript-discovery.js';
import { spawn } from 'child_process';
import { DIGEST_CHILD_ENV } from './config.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecapOptions {
  digestDir: string;
  since: string;
  maxLength: number;
  transcriptDir?: string;
  maxFallbackDigests?: number;
  logger?: Logger;
}

// ─── runRecap ─────────────────────────────────────────────────────────────────

export async function runRecap(options: RecapOptions): Promise<string> {
  const { logger } = options;

  // Fallback: discover and spawn background digests for undigested sessions
  let fallbackNote = '';
  if (options.transcriptDir) {
    const undigested = await discoverUndigestedSessions({
      transcriptDir: options.transcriptDir,
      digestDir: options.digestDir,
      sinceMs: parseDuration(options.since),
      maxSessions: options.maxFallbackDigests || 10,
    });

    if (undigested.length > 0) {
      logger?.info({ count: undigested.length }, 'spawning background digest processes');
      for (const session of undigested) {
        const child = spawn(process.execPath, [
          process.argv[1] || 'harness-mem',
          'digest',
          session.filePath,
          '--session-id',
          session.sessionId,
          '--digest-dir',
          options.digestDir,
        ], {
          detached: true,
          stdio: 'ignore',
          env: {
            ...process.env,
            [DIGEST_CHILD_ENV]: '1',
          },
        });
        child.unref();
      }
      fallbackNote = `${undigested.length} session(s) being digested in the background.\n\n`;
    }
  }

  const store = new DigestStore(options.digestDir);

  const entries = await store.query({ since: parseDuration(options.since) });
  logger?.debug({ entryCount: entries.length, since: options.since }, 'queried digests');

  if (entries.length === 0) {
    return fallbackNote || 'No recent sessions found.';
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

  return fallbackNote + result;
}
