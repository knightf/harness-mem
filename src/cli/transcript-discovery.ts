import fs from 'fs/promises';
import path from 'path';
import { DigestStore } from '../storage/digest-store.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiscoveredSession {
  sessionId: string;
  filePath: string;
  projectDir: string;
  mtime: Date;
}

export interface DiscoverOptions {
  transcriptDir: string;
  digestDir: string;
  sinceMs: number;
  maxSessions: number;
}

// ─── isSessionComplete ────────────────────────────────────────────────────────

/**
 * Reads the last ~5 non-empty lines of a JSONL transcript file and determines
 * whether the session has completed (i.e. is safe to digest).
 *
 * A session is considered complete when:
 *  - Any of the last lines contains `"type":"last-prompt"`
 *  - Any of the last lines contains a <local-command-stdout> farewell marker
 *
 * A session is considered incomplete when:
 *  - The last non-empty line has `"type":"progress"`
 */
export async function isSessionComplete(filePath: string): Promise<boolean> {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return false;
  }

  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return false;
  }

  const tail = lines.slice(-5);

  // Check for last-prompt marker
  if (tail.some((l) => l.includes('"type":"last-prompt"'))) {
    return true;
  }

  // Check for /exit farewell in local-command-stdout
  const farewellKeywords = ['Goodbye', 'Bye', 'Catch you later'];
  if (
    tail.some(
      (l) =>
        l.includes('<local-command-stdout>') &&
        farewellKeywords.some((kw) => l.includes(kw)),
    )
  ) {
    return true;
  }

  // Check if still in-progress
  const lastLine = lines[lines.length - 1];
  if (lastLine.includes('"type":"progress"')) {
    return false;
  }

  return false;
}

// ─── discoverUndigestedSessions ───────────────────────────────────────────────

/**
 * Scans `options.transcriptDir` for JSONL transcript files that:
 *  1. Were modified within the last `options.sinceMs` milliseconds
 *  2. Do not already have a digest in `options.digestDir`
 *  3. Are complete sessions (per `isSessionComplete`)
 *
 * Returns up to `options.maxSessions` results sorted by mtime descending.
 */
export async function discoverUndigestedSessions(
  options: DiscoverOptions,
): Promise<DiscoveredSession[]> {
  const { transcriptDir, digestDir, sinceMs, maxSessions } = options;

  const store = new DigestStore(digestDir);
  const now = Date.now();
  const cutoff = now - sinceMs;

  let projectDirs: string[];
  try {
    const entries = await fs.readdir(transcriptDir, { withFileTypes: true });
    projectDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => path.join(transcriptDir, e.name));
  } catch {
    return [];
  }

  const discovered: DiscoveredSession[] = [];

  for (const projectDir of projectDirs) {
    let files: string[];
    try {
      files = await fs.readdir(projectDir);
    } catch {
      continue;
    }

    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

    for (const file of jsonlFiles) {
      const sessionId = file.slice(0, -'.jsonl'.length);
      const filePath = path.join(projectDir, file);

      // Check mtime
      let stat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stat = await fs.stat(filePath);
      } catch {
        continue;
      }

      if (stat.mtimeMs < cutoff) {
        continue;
      }

      // Check if already digested
      const alreadyDigested = await store.exists(sessionId);
      if (alreadyDigested) {
        continue;
      }

      // Check if session is complete
      const complete = await isSessionComplete(filePath);
      if (!complete) {
        continue;
      }

      discovered.push({
        sessionId,
        filePath,
        projectDir,
        mtime: stat.mtime,
      });
    }
  }

  // Sort newest first
  discovered.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  return discovered.slice(0, maxSessions);
}
