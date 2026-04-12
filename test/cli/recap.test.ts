import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runRecap } from '../../src/cli/recap.js';
import { DigestStore } from '../../src/storage/digest-store.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let tmpDigestDir: string;
let store: DigestStore;

beforeEach(async () => {
  tmpDigestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-recap-'));
  store = new DigestStore(tmpDigestDir);
});

afterEach(async () => {
  await fs.rm(tmpDigestDir, { recursive: true, force: true });
});

describe('runRecap', () => {
  it('should return empty message when no digests exist', async () => {
    const output = await runRecap({ digestDir: tmpDigestDir, since: '24h', maxLength: 20000, cwd: '/project' });
    expect(output).toContain('No recent sessions');
  });

  it('should return digest content for one recent session', async () => {
    await store.write({
      sessionId: 'sess-1', timestamp: new Date().toISOString(),
      durationMinutes: 30, model: 'haiku', workingDirectory: '/project',
    }, '## What you worked on\n\nYou built a feature.');
    const output = await runRecap({ digestDir: tmpDigestDir, since: '24h', maxLength: 20000, cwd: '/project' });
    expect(output).toContain('You built a feature.');
  });

  it('should concatenate multiple digests newest-first', async () => {
    const now = Date.now();
    await store.write({
      sessionId: 'older', timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      durationMinutes: 10, model: 'haiku', workingDirectory: '/project',
    }, 'Older session content.');
    await store.write({
      sessionId: 'newer', timestamp: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(),
      durationMinutes: 10, model: 'haiku', workingDirectory: '/project',
    }, 'Newer session content.');
    const output = await runRecap({ digestDir: tmpDigestDir, since: '7d', maxLength: 20000, cwd: '/project' });
    const newerIdx = output.indexOf('Newer session content');
    const olderIdx = output.indexOf('Older session content');
    expect(newerIdx).toBeLessThan(olderIdx);
  });

  it('should truncate at maxLength and show note', async () => {
    await store.write({
      sessionId: 'big', timestamp: new Date().toISOString(),
      durationMinutes: 120, model: 'haiku', workingDirectory: '/project',
    }, 'x'.repeat(5000));
    await store.write({
      sessionId: 'also-big', timestamp: new Date().toISOString(),
      durationMinutes: 60, model: 'haiku', workingDirectory: '/project',
    }, 'y'.repeat(5000));
    const output = await runRecap({ digestDir: tmpDigestDir, since: '24h', maxLength: 6000, cwd: '/project' });
    expect(output.length).toBeLessThanOrEqual(7000);
    expect(output).toContain('more sessions not shown');
  });

  // ─── Project scoping ──────────────────────────────────────────────────────

  describe('project scoping', () => {
    it('excludes digests from other projects by default', async () => {
      await store.write({
        sessionId: 'proj-a', timestamp: new Date().toISOString(),
        durationMinutes: 10, model: 'haiku', workingDirectory: '/work/proj-a',
      }, 'Project A content.');
      await store.write({
        sessionId: 'proj-b', timestamp: new Date().toISOString(),
        durationMinutes: 10, model: 'haiku', workingDirectory: '/work/proj-b',
      }, 'Project B content.');

      const output = await runRecap({ digestDir: tmpDigestDir, since: '24h', maxLength: 20000, cwd: '/work/proj-a' });
      expect(output).toContain('Project A content.');
      expect(output).not.toContain('Project B content.');
    });

    it('includes digests from all projects with --all-projects', async () => {
      await store.write({
        sessionId: 'proj-a', timestamp: new Date().toISOString(),
        durationMinutes: 10, model: 'haiku', workingDirectory: '/work/proj-a',
      }, 'Project A content.');
      await store.write({
        sessionId: 'proj-b', timestamp: new Date().toISOString(),
        durationMinutes: 10, model: 'haiku', workingDirectory: '/work/proj-b',
      }, 'Project B content.');

      const output = await runRecap({
        digestDir: tmpDigestDir,
        since: '24h',
        maxLength: 20000,
        cwd: '/work/proj-a',
        allProjects: true,
      });
      expect(output).toContain('Project A content.');
      expect(output).toContain('Project B content.');
    });

    it('matches subdirectories of the stored project (prefix-aware)', async () => {
      await store.write({
        sessionId: 'proj-a', timestamp: new Date().toISOString(),
        durationMinutes: 10, model: 'haiku', workingDirectory: '/work/proj-a',
      }, 'Project A content.');
      const output = await runRecap({
        digestDir: tmpDigestDir,
        since: '24h',
        maxLength: 20000,
        cwd: '/work/proj-a/src/auth',
      });
      expect(output).toContain('Project A content.');
    });

    it('excludes legacy digests with no workingDirectory by default', async () => {
      await store.write({
        sessionId: 'legacy', timestamp: new Date().toISOString(),
        durationMinutes: 10, model: 'haiku', workingDirectory: '',
      }, 'Legacy content.');
      const output = await runRecap({ digestDir: tmpDigestDir, since: '24h', maxLength: 20000, cwd: '/work/proj' });
      expect(output).toContain('No recent sessions');
    });
  });
});
