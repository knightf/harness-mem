import type { DigestMetadata } from '../engine/types.js';
import { formatDigest, parseDigest } from '../summarizer/formatter.js';
import fs from 'fs/promises';
import path from 'path';

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

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private shortHash(sessionId: string): string {
    return sessionId.slice(0, 8);
  }

  private buildFilename(metadata: DigestMetadata): string {
    const d = new Date(metadata.timestamp);
    const YYYY = d.getUTCFullYear();
    const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
    const DD = String(d.getUTCDate()).padStart(2, '0');
    const HH = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    const shortHash = this.shortHash(metadata.sessionId);
    return `${YYYY}-${MM}-${DD}-${HH}${mm}${ss}-${shortHash}.md`;
  }
}
