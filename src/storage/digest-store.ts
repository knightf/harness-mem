import type { DigestMetadata, SessionConstraints } from '../engine/types.js';
import { formatDigest, parseDigest } from '../summarizer/formatter.js';
import fs from 'fs/promises';
import path from 'path';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DigestEntry {
  metadata: DigestMetadata;
  body: string;
}

export interface QueryOptions {
  since?: number; // milliseconds — only include digests newer than (now - since)
}

export interface CleanOptions {
  olderThanMs?: number;
  beforeDate?: Date;
  dryRun?: boolean;
}

// ─── DigestStore ─────────────────────────────────────────────────────────────

export class DigestStore {
  private readonly digestDir: string;

  constructor(digestDir: string) {
    this.digestDir = digestDir;
  }

  // ─── Write ──────────────────────────────────────────────────────────────────

  async write(metadata: DigestMetadata, body: string): Promise<void> {
    await fs.mkdir(this.digestDir, { recursive: true });

    const filename = this.buildFilename(metadata);
    const content = formatDigest(metadata, body);

    await fs.writeFile(path.join(this.digestDir, filename), content, 'utf-8');
  }

  // ─── Exists ─────────────────────────────────────────────────────────────────

  async exists(sessionId: string): Promise<boolean> {
    const shortHash = this.shortHash(sessionId);
    let files: string[];
    try {
      files = await fs.readdir(this.digestDir);
    } catch {
      return false;
    }
    return files.some((f) => f.includes(shortHash) && f.endsWith('.md'));
  }

  // ─── Query ──────────────────────────────────────────────────────────────────

  async query(options: QueryOptions = {}): Promise<DigestEntry[]> {
    let files: string[];
    try {
      files = await fs.readdir(this.digestDir);
    } catch {
      return [];
    }

    const mdFiles = files.filter((f) => f.endsWith('.md'));

    const entries: DigestEntry[] = [];

    for (const file of mdFiles) {
      const filePath = path.join(this.digestDir, file);
      try {
        const entry = await this.read(filePath);

        if (options.since !== undefined) {
          const age = Date.now() - Date.parse(entry.metadata.timestamp);
          if (age >= options.since) {
            continue;
          }
        }

        entries.push(entry);
      } catch {
        // Skip unparseable files
      }
    }

    // Sort newest first
    entries.sort(
      (a, b) => Date.parse(b.metadata.timestamp) - Date.parse(a.metadata.timestamp),
    );

    return entries;
  }

  // ─── Clean ──────────────────────────────────────────────────────────────────

  async clean(options: CleanOptions = {}): Promise<number> {
    let files: string[];
    try {
      files = await fs.readdir(this.digestDir);
    } catch {
      return 0;
    }

    const mdFiles = files.filter((f) => f.endsWith('.md'));
    let count = 0;

    for (const file of mdFiles) {
      const filePath = path.join(this.digestDir, file);
      try {
        const entry = await this.read(filePath);
        const age = Date.now() - Date.parse(entry.metadata.timestamp);

        let shouldDelete = false;

        if (options.olderThanMs !== undefined && age > options.olderThanMs) {
          shouldDelete = true;
        }

        if (
          options.beforeDate !== undefined &&
          Date.parse(entry.metadata.timestamp) < options.beforeDate.getTime()
        ) {
          shouldDelete = true;
        }

        if (shouldDelete) {
          count++;
          if (!options.dryRun) {
            await fs.unlink(filePath);
          }
        }
      } catch {
        // Skip unparseable files
      }
    }

    return count;
  }

  // ─── Read ────────────────────────────────────────────────────────────────────

  async read(filePath: string): Promise<DigestEntry> {
    const raw = await fs.readFile(filePath, 'utf-8');
    return parseDigest(raw);
  }

  // ─── Constraint Index ───────────────────────────────────────────────────────

  private get indexPath(): string {
    return path.join(this.digestDir, 'constraints.jsonl');
  }

  /**
   * Appends flattened constraints from a session to the JSONL index.
   */
  async appendIndex(
    sessionId: string,
    timestamp: string,
    workingDirectory: string,
    constraints: SessionConstraints,
  ): Promise<void> {
    await fs.mkdir(this.digestDir, { recursive: true });
    const lines = flattenConstraints(sessionId, timestamp, workingDirectory, constraints);
    if (lines.length === 0) return;
    const content = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
    await fs.appendFile(this.indexPath, content, 'utf-8');
  }

  /**
   * Rebuilds the JSONL index from all remaining digest files.
   */
  async rebuildIndex(): Promise<{ indexed: number; skipped: number }> {
    // Preserve disabled and shared state from existing index before rebuilding
    const stateMap = new Map<string, { disabled?: boolean; shared?: boolean }>();
    try {
      const existing = await fs.readFile(this.indexPath, 'utf-8');
      for (const line of existing.split('\n')) {
        if (!line) continue;
        try {
          const e: IndexEntry = JSON.parse(line);
          if (e.disabled || e.shared) {
            stateMap.set(`${e.type}|${e.sessionId}|${e.content}`, {
              disabled: e.disabled,
              shared: e.shared,
            });
          }
        } catch { /* skip malformed */ }
      }
    } catch { /* no existing index */ }

    const entries = await this.query();
    const lines: IndexEntry[] = [];
    let skipped = 0;

    for (const entry of entries) {
      try {
        const constraints: SessionConstraints = JSON.parse(entry.body);
        lines.push(
          ...flattenConstraints(
            entry.metadata.sessionId,
            entry.metadata.timestamp,
            entry.metadata.workingDirectory ?? '',
            constraints,
          ),
        );
      } catch {
        // Legacy markdown digest — cannot index
        skipped++;
      }
    }

    // Restore disabled and shared flags
    for (const line of lines) {
      const key = `${line.type}|${line.sessionId}|${line.content}`;
      const prior = stateMap.get(key);
      if (prior) {
        if (prior.disabled) line.disabled = true;
        if (prior.shared) line.shared = true;
      }
    }

    if (lines.length === 0) {
      // Remove stale index file rather than writing an empty one
      try { await fs.unlink(this.indexPath); } catch { /* already gone */ }
      return { indexed: 0, skipped };
    }

    const content = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
    await fs.writeFile(this.indexPath, content, 'utf-8');
    return { indexed: lines.length, skipped };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private shortHash(sessionId: string): string {
    return sessionId.slice(0, 8);
  }

  private buildFilename(metadata: DigestMetadata): string {
    const datePart = dayjs.utc(metadata.timestamp).format('YYYY-MM-DD-HHmmss');
    const shortHash = this.shortHash(metadata.sessionId);
    return `${datePart}-${shortHash}.md`;
  }
}

// ─── Index helpers ──────────────────────────────────────────────────────────

export type IndexEntryType = 'elimination' | 'decision' | 'invariant' | 'preference' | 'todo' | 'question';

export interface IndexEntry {
  type: IndexEntryType;
  content: string;
  keywords: string[];
  sessionId: string;
  timestamp: string;
  workingDirectory?: string;
  disabled?: boolean;
  shared?: boolean;
}

function flattenConstraints(
  sessionId: string,
  timestamp: string,
  workingDirectory: string,
  c: SessionConstraints,
): IndexEntry[] {
  const kw = c.keywords ?? [];
  const entries: IndexEntry[] = [];
  const wd = workingDirectory || undefined;

  for (const e of c.eliminations ?? []) {
    if (!e.dont || !e.because) continue;
    entries.push({ type: 'elimination', content: `Don't ${e.dont} — because ${e.because}`, keywords: kw, sessionId, timestamp, workingDirectory: wd });
  }
  for (const d of c.decisions ?? []) {
    if (!d.chose || !d.because) continue;
    const over = Array.isArray(d.over) ? d.over.join(', ') : '';
    entries.push({ type: 'decision', content: `Chose ${d.chose} over ${over} — because ${d.because}`, keywords: kw, sessionId, timestamp, workingDirectory: wd });
  }
  for (const i of c.invariants ?? []) {
    if (!i.always) continue;
    entries.push({ type: 'invariant', content: `Always ${i.always} — scope: ${i.scope ?? 'general'}`, keywords: kw, sessionId, timestamp, workingDirectory: wd });
  }
  for (const p of c.preferences ?? []) {
    if (!p.prefer) continue;
    entries.push({ type: 'preference', content: `Prefer ${p.prefer} over ${p.over ?? 'alternatives'} — context: ${p.context ?? 'general'}`, keywords: kw, sessionId, timestamp, workingDirectory: wd });
  }
  return entries;
}

// ─── Project matching ───────────────────────────────────────────────────────

/**
 * Normalizes a project path for prefix-aware comparison: trims, removes
 * trailing separators. Returns empty string for falsy input.
 */
export function normalizeProjectPath(p: string | undefined | null): string {
  if (!p) return '';
  let normalized = path.normalize(p.trim());
  // Strip trailing separator (but keep root '/')
  if (normalized.length > 1 && normalized.endsWith(path.sep)) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Returns true if the entry's stored cwd is "the same project" as the current
 * working directory. Match is prefix-aware: either path may be a parent of the
 * other (e.g. you can `cd` into a subdirectory of where the digest was made,
 * or up to the project root, and still match). Path-separator boundaries are
 * respected so `/foo` does not match `/foobar`.
 *
 * Returns false when entryCwd is empty/undefined — legacy entries are
 * project-less and only surface via `--all-projects` or `shared: true`.
 */
export function matchesProject(
  entryCwd: string | undefined | null,
  currentCwd: string | undefined | null,
): boolean {
  const entry = normalizeProjectPath(entryCwd);
  const current = normalizeProjectPath(currentCwd);
  if (!entry || !current) return false;
  if (entry === current) return true;
  const sep = path.sep;
  if (current.startsWith(entry + sep)) return true;
  if (entry.startsWith(current + sep)) return true;
  return false;
}
