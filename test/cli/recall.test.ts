import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runRecall } from '../../src/cli/recall.js';
import { DigestStore } from '../../src/storage/digest-store.js';
import type { SessionConstraints } from '../../src/engine/types.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let tmpDir: string;
let store: DigestStore;

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

  // Write two sessions to the index
  await store.appendIndex('session-auth', '2026-04-01T10:00:00Z', authConstraints);
  await store.appendIndex('session-db', '2026-04-02T10:00:00Z', dbConstraints);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('runRecall', () => {
  it('should return auth constraints for auth-related prompt', async () => {
    const result = await runRecall({ digestDir: tmpDir, prompt: 'fix the auth middleware bug' });
    expect(result.additionalContext).toContain('SessionStore');
    expect(result.additionalContext).toContain('JWT');
    expect(result.additionalContext).toContain('middleware/auth.ts');
  });

  it('should return database constraints for db-related prompt', async () => {
    const result = await runRecall({ digestDir: tmpDir, prompt: 'update the database migration' });
    expect(result.additionalContext).toContain('mock the database');
    expect(result.additionalContext).not.toContain('rollback');
  });

  it('should return empty for unrelated prompt', async () => {
    const result = await runRecall({ digestDir: tmpDir, prompt: 'update the CSS styles' });
    expect(result.additionalContext).toBe('');
  });

  it('should return empty for empty prompt', async () => {
    const result = await runRecall({ digestDir: tmpDir, prompt: '' });
    expect(result.additionalContext).toBe('');
  });

  it('should return empty when no index file exists', async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-empty-'));
    const result = await runRecall({ digestDir: emptyDir, prompt: 'fix auth' });
    expect(result.additionalContext).toBe('');
    await fs.rm(emptyDir, { recursive: true, force: true });
  });

  it('should respect maxChars budget', async () => {
    const result = await runRecall({ digestDir: tmpDir, prompt: 'auth jwt middleware database migration', maxChars: 100 });
    expect(result.additionalContext.length).toBeLessThanOrEqual(200); // header + budget
  });

  it('should skip disabled entries', async () => {
    // Manually write an index with a disabled entry
    const indexPath = path.join(tmpDir, 'constraints.jsonl');
    const lines = [
      JSON.stringify({ type: 'elimination', content: "Don't use old SessionStore", keywords: ['auth', 'session'], sessionId: 's1', timestamp: '2026-04-01T10:00:00Z', disabled: true }),
      JSON.stringify({ type: 'decision', content: 'Chose stateless JWT', keywords: ['auth', 'jwt'], sessionId: 's1', timestamp: '2026-04-01T10:00:00Z' }),
    ];
    await fs.writeFile(indexPath, lines.join('\n') + '\n', 'utf-8');

    const result = await runRecall({ digestDir: tmpDir, prompt: 'auth session jwt' });
    expect(result.additionalContext).not.toContain('SessionStore');
    expect(result.additionalContext).toContain('JWT');
  });

  it('should include entries without disabled field (backward compat)', async () => {
    const indexPath = path.join(tmpDir, 'constraints.jsonl');
    const lines = [
      JSON.stringify({ type: 'decision', content: 'Chose stateless JWT', keywords: ['auth', 'jwt'], sessionId: 's1', timestamp: '2026-04-01T10:00:00Z' }),
    ];
    await fs.writeFile(indexPath, lines.join('\n') + '\n', 'utf-8');

    const result = await runRecall({ digestDir: tmpDir, prompt: 'auth jwt' });
    expect(result.additionalContext).toContain('JWT');
  });
});
