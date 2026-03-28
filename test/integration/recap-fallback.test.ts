// test/integration/recap-fallback.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runRecap } from '../../src/cli/recap.js';
import { DigestStore } from '../../src/storage/digest-store.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock spawn at top level — Vitest hoists vi.mock calls
vi.mock('child_process', () => ({
  spawn: vi.fn().mockReturnValue({ unref: vi.fn() }),
}));

let tmpDigestDir: string;
let tmpTranscriptDir: string;

beforeEach(async () => {
  tmpDigestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-recap-fb-'));
  tmpTranscriptDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-trans-fb-'));
});

afterEach(async () => {
  await fs.rm(tmpDigestDir, { recursive: true, force: true });
  await fs.rm(tmpTranscriptDir, { recursive: true, force: true });
});

describe('Recap with Fallback', () => {
  it('should report undigested sessions without blocking', async () => {
    const projectDir = path.join(tmpTranscriptDir, 'C--project');
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, 'undigested-session.jsonl'),
      '{"type":"user","timestamp":"' + new Date().toISOString() + '","sessionId":"undigested-session","message":{"role":"user","content":"hi"}}\n{"type":"last-prompt","lastPrompt":"hi","sessionId":"undigested-session"}\n'
    );

    const output = await runRecap({
      digestDir: tmpDigestDir,
      transcriptDir: tmpTranscriptDir,
      since: '24h',
      maxLength: 20000,
      maxFallbackDigests: 10,
    });

    expect(output).toContain('being digested in the background');

    // Verify spawn was called with the correct transcript path (not undefined)
    const { spawn } = await import('child_process');
    expect(spawn).toHaveBeenCalled();
    const spawnCall = (spawn as any).mock.calls[0];
    const spawnArgs = spawnCall[1];
    const spawnOptions = spawnCall[2];
    expect(spawnArgs.some((arg: string) => arg.includes('undigested-session.jsonl'))).toBe(true);
    expect(spawnArgs).toContain('--session-id');
    expect(spawnArgs).toContain('undigested-session');
    expect(spawnArgs).toContain('--digest-dir');
    expect(spawnArgs).toContain(tmpDigestDir);
    expect(spawnOptions).toMatchObject({
      detached: true,
      stdio: 'ignore',
      env: expect.objectContaining({
        HARNESS_MEM_DIGEST_CHILD: '1',
      }),
    });
  });

  it('should show existing digests alongside fallback note', async () => {
    const store = new DigestStore(tmpDigestDir);
    await store.write({
      sessionId: 'existing',
      timestamp: new Date().toISOString(),
      durationMinutes: 20,
      model: 'haiku',
      workingDirectory: '/project',
    }, '## What you worked on\n\nYou built something.');

    const output = await runRecap({
      digestDir: tmpDigestDir,
      since: '24h',
      maxLength: 20000,
    });

    expect(output).toContain('You built something.');
  });
});
