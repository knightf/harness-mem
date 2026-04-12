import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runRecall } from '../../src/cli/recall.js';
import { DigestStore } from '../../src/storage/digest-store.js';
import type { SessionConstraints } from '../../src/engine/types.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let tmpDir: string;
let store: DigestStore;
const PROJECT_A = '/work/project-a';
const PROJECT_B = '/work/project-b';

const authConstraints: SessionConstraints = {
  summary: 'Refactored auth middleware to use JWT.',
  keywords: ['auth', 'jwt', 'middleware', 'compliance'],
  eliminations: [{ dont: 'use old SessionStore', because: 'compliance violation' }],
  decisions: [{ chose: 'stateless JWT', over: ['Redis sessions'], because: 'reduces infra dependency' }],
  invariants: [{ always: 'auth flows go through middleware/auth.ts', scope: 'all API routes' }],
  preferences: [],
  openThreads: [],
};

const dbConstraints: SessionConstraints = {
  summary: 'Fixed database migration issue.',
  keywords: ['database', 'migration', 'postgres', 'schema'],
  eliminations: [{ dont: 'mock the database in integration tests', because: 'masked a broken migration' }],
  decisions: [],
  invariants: [],
  preferences: [],
  openThreads: [{ type: 'todo', what: 'add rollback migration', context: 'no rollback for latest schema change' }],
};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-recall-'));
  store = new DigestStore(tmpDir);

  // Write two sessions to the index, both originating from PROJECT_A
  await store.appendIndex('session-auth', '2026-04-01T10:00:00Z', PROJECT_A, authConstraints);
  await store.appendIndex('session-db', '2026-04-02T10:00:00Z', PROJECT_A, dbConstraints);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('runRecall', () => {
  it('should return auth constraints for auth-related prompt', async () => {
    const result = await runRecall({ digestDir: tmpDir, prompt: 'fix the auth middleware bug', cwd: PROJECT_A });
    expect(result.additionalContext).toContain('SessionStore');
    expect(result.additionalContext).toContain('JWT');
    expect(result.additionalContext).toContain('middleware/auth.ts');
  });

  it('should return database constraints for db-related prompt', async () => {
    const result = await runRecall({ digestDir: tmpDir, prompt: 'update the database migration', cwd: PROJECT_A });
    expect(result.additionalContext).toContain('mock the database');
    expect(result.additionalContext).not.toContain('rollback');
  });

  it('should return empty for unrelated prompt', async () => {
    const result = await runRecall({ digestDir: tmpDir, prompt: 'update the CSS styles', cwd: PROJECT_A });
    expect(result.additionalContext).toBe('');
  });

  it('should return empty for empty prompt', async () => {
    const result = await runRecall({ digestDir: tmpDir, prompt: '', cwd: PROJECT_A });
    expect(result.additionalContext).toBe('');
  });

  it('should return empty when no index file exists', async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-empty-'));
    const result = await runRecall({ digestDir: emptyDir, prompt: 'fix auth', cwd: PROJECT_A });
    expect(result.additionalContext).toBe('');
    await fs.rm(emptyDir, { recursive: true, force: true });
  });

  it('should respect maxChars budget', async () => {
    const result = await runRecall({ digestDir: tmpDir, prompt: 'auth jwt middleware database migration', maxChars: 100, cwd: PROJECT_A });
    expect(result.additionalContext.length).toBeLessThanOrEqual(200); // header + budget
  });

  it('should skip disabled entries', async () => {
    // Manually write an index with a disabled entry
    const indexPath = path.join(tmpDir, 'constraints.jsonl');
    const lines = [
      JSON.stringify({ type: 'elimination', content: "Don't use old SessionStore", keywords: ['auth', 'session'], sessionId: 's1', timestamp: '2026-04-01T10:00:00Z', workingDirectory: PROJECT_A, disabled: true }),
      JSON.stringify({ type: 'decision', content: 'Chose stateless JWT', keywords: ['auth', 'jwt'], sessionId: 's1', timestamp: '2026-04-01T10:00:00Z', workingDirectory: PROJECT_A }),
    ];
    await fs.writeFile(indexPath, lines.join('\n') + '\n', 'utf-8');

    const result = await runRecall({ digestDir: tmpDir, prompt: 'auth session jwt', cwd: PROJECT_A });
    expect(result.additionalContext).not.toContain('SessionStore');
    expect(result.additionalContext).toContain('JWT');
  });

  it('should include entries without disabled field (backward compat)', async () => {
    const indexPath = path.join(tmpDir, 'constraints.jsonl');
    const lines = [
      JSON.stringify({ type: 'decision', content: 'Chose stateless JWT', keywords: ['auth', 'jwt'], sessionId: 's1', timestamp: '2026-04-01T10:00:00Z', workingDirectory: PROJECT_A }),
    ];
    await fs.writeFile(indexPath, lines.join('\n') + '\n', 'utf-8');

    const result = await runRecall({ digestDir: tmpDir, prompt: 'auth jwt', cwd: PROJECT_A });
    expect(result.additionalContext).toContain('JWT');
  });

  // ─── Project scoping ──────────────────────────────────────────────────────

  describe('project scoping', () => {
    it('excludes constraints from other projects by default', async () => {
      const result = await runRecall({ digestDir: tmpDir, prompt: 'auth jwt middleware', cwd: PROJECT_B });
      expect(result.additionalContext).toBe('');
    });

    it('includes constraints from all projects when allProjects is true', async () => {
      const result = await runRecall({
        digestDir: tmpDir,
        prompt: 'auth jwt middleware',
        cwd: PROJECT_B,
        allProjects: true,
      });
      expect(result.additionalContext).toContain('JWT');
    });

    it('matches a subdirectory of the stored project (prefix-aware)', async () => {
      const result = await runRecall({
        digestDir: tmpDir,
        prompt: 'auth jwt',
        cwd: path.join(PROJECT_A, 'src', 'auth'),
      });
      expect(result.additionalContext).toContain('JWT');
    });

    it('matches a parent of the stored project (prefix-aware)', async () => {
      const result = await runRecall({
        digestDir: tmpDir,
        prompt: 'auth jwt',
        cwd: '/work',
      });
      expect(result.additionalContext).toContain('JWT');
    });

    it('does not match sibling projects with overlapping name prefix', async () => {
      const result = await runRecall({
        digestDir: tmpDir,
        prompt: 'auth jwt',
        cwd: '/work/project-a-sidekick',
      });
      expect(result.additionalContext).toBe('');
    });

    it('includes shared entries regardless of current project', async () => {
      // Manually mark one entry as shared
      const indexPath = path.join(tmpDir, 'constraints.jsonl');
      const raw = await fs.readFile(indexPath, 'utf-8');
      const lines = raw.split('\n').filter((l) => l.length > 0);
      const updated = lines.map((line) => {
        const e = JSON.parse(line);
        if (e.content && e.content.includes('JWT')) {
          e.shared = true;
        }
        return JSON.stringify(e);
      });
      await fs.writeFile(indexPath, updated.join('\n') + '\n', 'utf-8');

      const result = await runRecall({ digestDir: tmpDir, prompt: 'auth jwt middleware', cwd: PROJECT_B });
      expect(result.additionalContext).toContain('JWT');
      // Non-shared SessionStore elimination should NOT appear from PROJECT_B
      expect(result.additionalContext).not.toContain('SessionStore');
    });

    it('disabled flag still beats shared flag', async () => {
      const indexPath = path.join(tmpDir, 'constraints.jsonl');
      await fs.writeFile(
        indexPath,
        JSON.stringify({
          type: 'decision',
          content: 'Chose stateless JWT',
          keywords: ['auth', 'jwt'],
          sessionId: 's1',
          timestamp: '2026-04-01T10:00:00Z',
          workingDirectory: PROJECT_A,
          shared: true,
          disabled: true,
        }) + '\n',
        'utf-8',
      );

      const result = await runRecall({ digestDir: tmpDir, prompt: 'auth jwt', cwd: PROJECT_B });
      expect(result.additionalContext).toBe('');
    });

    it('legacy entries without workingDirectory are excluded by default', async () => {
      const indexPath = path.join(tmpDir, 'constraints.jsonl');
      await fs.writeFile(
        indexPath,
        JSON.stringify({
          type: 'decision',
          content: 'Chose stateless JWT',
          keywords: ['auth', 'jwt'],
          sessionId: 's1',
          timestamp: '2026-04-01T10:00:00Z',
        }) + '\n',
        'utf-8',
      );

      const scoped = await runRecall({ digestDir: tmpDir, prompt: 'auth jwt', cwd: PROJECT_A });
      expect(scoped.additionalContext).toBe('');

      const all = await runRecall({ digestDir: tmpDir, prompt: 'auth jwt', cwd: PROJECT_A, allProjects: true });
      expect(all.additionalContext).toContain('JWT');
    });
  });
});
