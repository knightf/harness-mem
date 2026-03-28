import type { DigestMetadata } from '../engine/types.js';
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
    const content = this.buildContent(metadata, body);

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
    return this.parse(raw);
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

  private buildContent(metadata: DigestMetadata, body: string): string {
    const frontmatter = [
      '---',
      `session_id: ${metadata.sessionId}`,
      `timestamp: ${metadata.timestamp}`,
      `duration_minutes: ${metadata.durationMinutes}`,
      `model: ${metadata.model}`,
      `working_directory: ${metadata.workingDirectory}`,
      '---',
    ].join('\n');

    return `${frontmatter}\n\n${body}`;
  }

  private parse(raw: string): DigestEntry {
    // Split on --- delimiters. Content looks like: ---\n<frontmatter>\n---\n\n<body>
    const parts = raw.split(/^---\s*$/m);

    // parts[0] is empty string before first ---, parts[1] is frontmatter, parts[2+] is body
    if (parts.length < 3) {
      throw new Error('Invalid digest format: missing frontmatter delimiters');
    }

    const frontmatterRaw = parts[1];
    const bodyRaw = parts.slice(2).join('---').trimStart();

    const metadata = this.parseFrontmatter(frontmatterRaw);

    return { metadata, body: bodyRaw };
  }

  private parseFrontmatter(raw: string): DigestMetadata {
    const kvMap: Record<string, string> = {};

    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;
      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();
      kvMap[key] = value;
    }

    return {
      sessionId: kvMap['session_id'] ?? '',
      timestamp: kvMap['timestamp'] ?? '',
      durationMinutes: Number(kvMap['duration_minutes'] ?? 0),
      model: kvMap['model'] ?? '',
      workingDirectory: kvMap['working_directory'] ?? '',
    };
  }
}
