import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runClean } from '../../src/cli/clean.js';
import { DigestStore } from '../../src/storage/digest-store.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let tmpDir: string;
let store: DigestStore;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-clean-'));
  store = new DigestStore(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('runClean', () => {
  it('should delete old digests', async () => {
    await store.write({
      sessionId: 'old', timestamp: '2025-01-01T00:00:00Z',
      durationMinutes: 10, model: 'haiku', workingDirectory: '/project',
    }, 'Old stuff');
    const result = await runClean({ digestDir: tmpDir, olderThan: '30d' });
    expect(result.deleted).toBe(1);
    const files = await fs.readdir(tmpDir);
    expect(files.length).toBe(0);
  });

  it('should support dry-run', async () => {
    await store.write({
      sessionId: 'old', timestamp: '2025-01-01T00:00:00Z',
      durationMinutes: 10, model: 'haiku', workingDirectory: '/project',
    }, 'Old stuff');
    const result = await runClean({ digestDir: tmpDir, olderThan: '30d', dryRun: true });
    expect(result.deleted).toBe(0);
    expect(result.wouldDelete).toBe(1);
    const files = await fs.readdir(tmpDir);
    expect(files.length).toBe(1);
  });

  it('should delete digests before a specific date', async () => {
    await store.write({
      sessionId: 'before-cutoff', timestamp: '2026-02-01T00:00:00Z',
      durationMinutes: 10, model: 'haiku', workingDirectory: '/project',
    }, 'Before cutoff');
    await store.write({
      sessionId: 'after-cutoff', timestamp: '2026-03-15T00:00:00Z',
      durationMinutes: 10, model: 'haiku', workingDirectory: '/project',
    }, 'After cutoff');

    const result = await runClean({ digestDir: tmpDir, olderThan: '999d', before: '2026-03-01T00:00:00Z' });
    expect(result.deleted).toBe(1);

    const files = await fs.readdir(tmpDir);
    expect(files.length).toBe(1);
  });

  it('should not delete recent digests', async () => {
    await store.write({
      sessionId: 'recent', timestamp: new Date().toISOString(),
      durationMinutes: 10, model: 'haiku', workingDirectory: '/project',
    }, 'Recent stuff');
    const result = await runClean({ digestDir: tmpDir, olderThan: '30d' });
    expect(result.deleted).toBe(0);
    const files = await fs.readdir(tmpDir);
    expect(files.length).toBe(1);
  });
});
