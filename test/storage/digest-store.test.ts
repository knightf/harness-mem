import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DigestStore, type IndexEntry } from '../../src/storage/digest-store.js';
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
    await store.appendIndex('rebuild-test', new Date().toISOString(), constraints);

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
    await store.appendIndex('thread-test', new Date().toISOString(), constraints);

    const indexPath = path.join(tmpDir, 'constraints.jsonl');
    const raw = await fs.readFile(indexPath, 'utf-8');
    const entries = raw.trim().split('\n').map((line) => JSON.parse(line));

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('elimination');
    expect(entries.every((e: { type: string }) => e.type !== 'todo' && e.type !== 'question')).toBe(true);
  });
});
