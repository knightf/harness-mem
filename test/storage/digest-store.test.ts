import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DigestStore } from '../../src/storage/digest-store.js';
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
});
