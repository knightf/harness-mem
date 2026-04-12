import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DigestStore,
  matchesProject,
  normalizeProjectPath,
  type IndexEntry,
} from '../../src/storage/digest-store.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let tmpDir: string;
let store: DigestStore;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-test-'));
  store = new DigestStore(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('DigestStore', () => {
  it('should write a digest file with frontmatter and body', async () => {
    await store.write({
      sessionId: 'abc-123',
      timestamp: '2026-03-28T14:30:00Z',
      durationMinutes: 45,
      model: 'claude-haiku-4-5-20251001',
      workingDirectory: '/home/user/project',
    }, '## What you worked on\n\nYou built a feature.');

    const files = await fs.readdir(tmpDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/\.md$/);

    const content = await fs.readFile(path.join(tmpDir, files[0]), 'utf-8');
    expect(content).toContain('session_id: abc-123');
    expect(content).toContain('## What you worked on');
  });

  it('should check if digest exists for session ID', async () => {
    expect(await store.exists('abc-123')).toBe(false);
    await store.write({
      sessionId: 'abc-123',
      timestamp: '2026-03-28T14:30:00Z',
      durationMinutes: 45,
      model: 'claude-haiku-4-5-20251001',
      workingDirectory: '/project',
    }, 'Summary');
    expect(await store.exists('abc-123')).toBe(true);
  });

  it('should read digests filtered by time', async () => {
    await store.write({
      sessionId: 'recent',
      timestamp: new Date().toISOString(),
      durationMinutes: 10,
      model: 'haiku',
      workingDirectory: '/project',
    }, 'Recent work');

    const digests = await store.query({ since: 24 * 60 * 60 * 1000 });
    expect(digests.length).toBe(1);
    expect(digests[0].metadata.sessionId).toBe('recent');
    expect(digests[0].body).toContain('Recent work');
  });

  it('should return digests sorted newest-first', async () => {
    const now = Date.now();
    await store.write({
      sessionId: 'older',
      timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      durationMinutes: 10,
      model: 'haiku',
      workingDirectory: '/project',
    }, 'Older work');

    await store.write({
      sessionId: 'newer',
      timestamp: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(),
      durationMinutes: 10,
      model: 'haiku',
      workingDirectory: '/project',
    }, 'Newer work');

    const digests = await store.query({ since: 7 * 24 * 60 * 60 * 1000 });
    expect(digests[0].metadata.sessionId).toBe('newer');
    expect(digests[1].metadata.sessionId).toBe('older');
  });

  it('should delete digests older than threshold', async () => {
    await store.write({
      sessionId: 'old',
      timestamp: '2026-01-01T00:00:00Z',
      durationMinutes: 10,
      model: 'haiku',
      workingDirectory: '/project',
    }, 'Old work');

    const deleted = await store.clean({ olderThanMs: 24 * 60 * 60 * 1000 });
    expect(deleted).toBe(1);

    const files = await fs.readdir(tmpDir);
    expect(files.length).toBe(0);
  });

  it('should preserve disabled state on rebuildIndex', async () => {
    // Write a digest that will be re-indexed
    const constraints = {
      summary: 'Test session',
      keywords: ['test'],
      eliminations: [{ dont: 'use eval', because: 'security risk' }],
      decisions: [],
      invariants: [],
      preferences: [],
      openThreads: [],
    };
    await store.write({
      sessionId: 'rebuild-test',
      timestamp: new Date().toISOString(),
      durationMinutes: 10,
      model: 'haiku',
      workingDirectory: '/project',
    }, JSON.stringify(constraints));
    await store.appendIndex('rebuild-test', new Date().toISOString(), '/project', constraints);

    // Manually mark the entry as disabled in the JSONL
    const indexPath = path.join(tmpDir, 'constraints.jsonl');
    const raw = await fs.readFile(indexPath, 'utf-8');
    const entry: IndexEntry = JSON.parse(raw.trim());
    entry.disabled = true;
    await fs.writeFile(indexPath, JSON.stringify(entry) + '\n', 'utf-8');

    // Rebuild — disabled flag should survive
    const result = await store.rebuildIndex();
    expect(result.indexed).toBe(1);

    const rebuilt = await fs.readFile(indexPath, 'utf-8');
    const rebuiltEntry: IndexEntry = JSON.parse(rebuilt.trim());
    expect(rebuiltEntry.disabled).toBe(true);
  });

  it('should preserve shared state on rebuildIndex', async () => {
    const constraints = {
      summary: 'Shared session',
      keywords: ['shared'],
      eliminations: [{ dont: 'commit secrets', because: 'security risk' }],
      decisions: [],
      invariants: [],
      preferences: [],
      openThreads: [],
    };
    await store.write({
      sessionId: 'shared-test',
      timestamp: new Date().toISOString(),
      durationMinutes: 10,
      model: 'haiku',
      workingDirectory: '/project',
    }, JSON.stringify(constraints));
    await store.appendIndex('shared-test', new Date().toISOString(), '/project', constraints);

    // Manually mark the entry as shared
    const indexPath = path.join(tmpDir, 'constraints.jsonl');
    const raw = await fs.readFile(indexPath, 'utf-8');
    const entry: IndexEntry = JSON.parse(raw.trim());
    entry.shared = true;
    await fs.writeFile(indexPath, JSON.stringify(entry) + '\n', 'utf-8');

    const result = await store.rebuildIndex();
    expect(result.indexed).toBe(1);

    const rebuilt = await fs.readFile(indexPath, 'utf-8');
    const rebuiltEntry: IndexEntry = JSON.parse(rebuilt.trim());
    expect(rebuiltEntry.shared).toBe(true);
  });

  it('should backfill workingDirectory from digest metadata on rebuildIndex', async () => {
    const constraints = {
      summary: 'Legacy entry test',
      keywords: ['legacy'],
      eliminations: [{ dont: 'use deprecated API', because: 'removed in v2' }],
      decisions: [],
      invariants: [],
      preferences: [],
      openThreads: [],
    };
    await store.write({
      sessionId: 'legacy-test',
      timestamp: new Date().toISOString(),
      durationMinutes: 5,
      model: 'haiku',
      workingDirectory: '/work/legacy-project',
    }, JSON.stringify(constraints));

    // Write a JSONL entry WITHOUT workingDirectory (simulating a legacy index)
    const indexPath = path.join(tmpDir, 'constraints.jsonl');
    await fs.writeFile(
      indexPath,
      JSON.stringify({
        type: 'elimination',
        content: "Don't use deprecated API — because removed in v2",
        keywords: ['legacy'],
        sessionId: 'legacy-test',
        timestamp: new Date().toISOString(),
      }) + '\n',
      'utf-8',
    );

    await store.rebuildIndex();
    const rebuilt = await fs.readFile(indexPath, 'utf-8');
    const entry: IndexEntry = JSON.parse(rebuilt.trim());
    expect(entry.workingDirectory).toBe('/work/legacy-project');
  });

  it('should not set disabled on fresh entries during rebuildIndex', async () => {
    const constraints = {
      summary: 'Fresh session',
      keywords: ['fresh'],
      eliminations: [],
      decisions: [{ chose: 'option A', over: ['option B'], because: 'faster' }],
      invariants: [],
      preferences: [],
      openThreads: [],
    };
    await store.write({
      sessionId: 'fresh-test',
      timestamp: new Date().toISOString(),
      durationMinutes: 5,
      model: 'haiku',
      workingDirectory: '/project',
    }, JSON.stringify(constraints));

    const result = await store.rebuildIndex();
    expect(result.indexed).toBe(1);

    const indexPath = path.join(tmpDir, 'constraints.jsonl');
    const raw = await fs.readFile(indexPath, 'utf-8');
    const entry: IndexEntry = JSON.parse(raw.trim());
    expect(entry.disabled).toBeUndefined();
    expect(entry.shared).toBeUndefined();
    expect(entry.workingDirectory).toBe('/project');
  });

  it('should exclude openThreads from index', async () => {
    const constraints = {
      summary: 'Session with todos',
      keywords: ['test'],
      eliminations: [{ dont: 'use eval', because: 'security risk' }],
      decisions: [],
      invariants: [],
      preferences: [],
      openThreads: [
        { type: 'todo' as const, what: 'fix the tests', context: 'broken suite' },
        { type: 'question' as const, what: 'should we use Redis?', context: 'caching' },
      ],
    };
    await store.appendIndex('thread-test', new Date().toISOString(), '/project', constraints);

    const indexPath = path.join(tmpDir, 'constraints.jsonl');
    const raw = await fs.readFile(indexPath, 'utf-8');
    const entries = raw.trim().split('\n').map((line) => JSON.parse(line));

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('elimination');
    expect(entries.every((e: { type: string }) => e.type !== 'todo' && e.type !== 'question')).toBe(true);
  });

  it('appendIndex stores workingDirectory on each entry', async () => {
    const constraints = {
      summary: 'Project session',
      keywords: ['scoped'],
      eliminations: [{ dont: 'use globals', because: 'side effects' }],
      decisions: [{ chose: 'pure functions', over: ['shared state'], because: 'testability' }],
      invariants: [],
      preferences: [],
      openThreads: [],
    };
    await store.appendIndex('proj-test', '2026-04-12T00:00:00Z', '/work/scoped', constraints);

    const indexPath = path.join(tmpDir, 'constraints.jsonl');
    const raw = await fs.readFile(indexPath, 'utf-8');
    const entries = raw.trim().split('\n').map((line) => JSON.parse(line) as IndexEntry);
    expect(entries).toHaveLength(2);
    for (const e of entries) {
      expect(e.workingDirectory).toBe('/work/scoped');
    }
  });
});

// ─── Project matching helpers ─────────────────────────────────────────────────

describe('normalizeProjectPath', () => {
  it('returns empty string for undefined or empty input', () => {
    expect(normalizeProjectPath(undefined)).toBe('');
    expect(normalizeProjectPath('')).toBe('');
    expect(normalizeProjectPath(null)).toBe('');
  });

  it('strips trailing path separator', () => {
    expect(normalizeProjectPath('/foo/bar/')).toBe('/foo/bar');
  });

  it('preserves root separator', () => {
    expect(normalizeProjectPath('/')).toBe('/');
  });

  it('normalizes relative segments', () => {
    expect(normalizeProjectPath('/foo/./bar')).toBe('/foo/bar');
    expect(normalizeProjectPath('/foo/baz/../bar')).toBe('/foo/bar');
  });
});

describe('matchesProject', () => {
  it('returns true for exact equality', () => {
    expect(matchesProject('/work/proj', '/work/proj')).toBe(true);
  });

  it('returns true when current cwd is a subdirectory of stored path', () => {
    expect(matchesProject('/work/proj', '/work/proj/src/auth')).toBe(true);
  });

  it('returns true when stored path is a subdirectory of current cwd', () => {
    expect(matchesProject('/work/proj/src/auth', '/work/proj')).toBe(true);
  });

  it('returns false for sibling directories', () => {
    expect(matchesProject('/work/proj-a', '/work/proj-b')).toBe(false);
  });

  it('returns false when stored path is empty or missing', () => {
    expect(matchesProject(undefined, '/work/proj')).toBe(false);
    expect(matchesProject('', '/work/proj')).toBe(false);
    expect(matchesProject(null, '/work/proj')).toBe(false);
  });

  it('returns false when current cwd is empty', () => {
    expect(matchesProject('/work/proj', '')).toBe(false);
    expect(matchesProject('/work/proj', undefined)).toBe(false);
  });

  it('respects path separator boundaries (no false positive on shared prefix)', () => {
    expect(matchesProject('/work/proj', '/work/proj-sidekick')).toBe(false);
    expect(matchesProject('/work/proj-sidekick', '/work/proj')).toBe(false);
  });

  it('handles trailing slashes', () => {
    expect(matchesProject('/work/proj/', '/work/proj')).toBe(true);
    expect(matchesProject('/work/proj', '/work/proj/')).toBe(true);
  });
});
