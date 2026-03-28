import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { discoverUndigestedSessions, isSessionComplete } from '../../src/cli/transcript-discovery.js';
import { DigestStore } from '../../src/storage/digest-store.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let tmpTranscriptDir: string;
let tmpDigestDir: string;

beforeEach(async () => {
  tmpTranscriptDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-transcripts-'));
  tmpDigestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-digests-'));
  const projectDir = path.join(tmpTranscriptDir, 'C--Users-Eric-Repos-project');
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(
    path.join(projectDir, 'aaaa-bbbb-cccc-dddd.jsonl'),
    '{"type":"user","timestamp":"2026-03-28T10:00:00Z","sessionId":"aaaa-bbbb-cccc-dddd","message":{"role":"user","content":"hello"}}\n{"type":"last-prompt","lastPrompt":"hello","sessionId":"aaaa-bbbb-cccc-dddd"}\n'
  );
});

afterEach(async () => {
  await fs.rm(tmpTranscriptDir, { recursive: true, force: true });
  await fs.rm(tmpDigestDir, { recursive: true, force: true });
});

describe('isSessionComplete', () => {
  it('should return true when last line is last-prompt', async () => {
    const projectDir = path.join(tmpTranscriptDir, 'C--Users-Eric-Repos-project');
    const filePath = path.join(projectDir, 'complete-session.jsonl');
    await fs.writeFile(filePath, [
      '{"type":"user","sessionId":"complete-session","message":{"role":"user","content":"hi"}}',
      '{"type":"assistant","sessionId":"complete-session","message":{"role":"assistant","content":"hello"}}',
      '{"type":"last-prompt","lastPrompt":"hi","sessionId":"complete-session"}',
    ].join('\n') + '\n');
    expect(await isSessionComplete(filePath)).toBe(true);
  });

  it('should return true when session has /exit farewell', async () => {
    const projectDir = path.join(tmpTranscriptDir, 'C--Users-Eric-Repos-project');
    const filePath = path.join(projectDir, 'exited-session.jsonl');
    await fs.writeFile(filePath, [
      '{"type":"user","sessionId":"exited-session","message":{"role":"user","content":"hi"}}',
      '{"type":"user","sessionId":"exited-session","message":{"role":"user","content":[{"type":"text","text":"<local-command-stdout>Goodbye!</local-command-stdout>"}]}}',
    ].join('\n') + '\n');
    expect(await isSessionComplete(filePath)).toBe(true);
  });

  it('should return false when last line is progress', async () => {
    const projectDir = path.join(tmpTranscriptDir, 'C--Users-Eric-Repos-project');
    const filePath = path.join(projectDir, 'active-session.jsonl');
    await fs.writeFile(filePath, [
      '{"type":"user","sessionId":"active-session","message":{"role":"user","content":"hi"}}',
      '{"type":"progress","sessionId":"active-session"}',
    ].join('\n') + '\n');
    expect(await isSessionComplete(filePath)).toBe(false);
  });
});

describe('discoverUndigestedSessions', () => {
  it('should find transcripts without digests', async () => {
    const results = await discoverUndigestedSessions({
      transcriptDir: tmpTranscriptDir,
      digestDir: tmpDigestDir,
      sinceMs: 24 * 60 * 60 * 1000,
      maxSessions: 10,
    });
    expect(results.length).toBe(1);
    expect(results[0].sessionId).toBe('aaaa-bbbb-cccc-dddd');
  });

  it('should skip already-digested sessions', async () => {
    const store = new DigestStore(tmpDigestDir);
    await store.write({
      sessionId: 'aaaa-bbbb-cccc-dddd',
      timestamp: new Date().toISOString(),
      durationMinutes: 10,
      model: 'haiku',
      workingDirectory: '/project',
    }, 'Already digested');
    const results = await discoverUndigestedSessions({
      transcriptDir: tmpTranscriptDir,
      digestDir: tmpDigestDir,
      sinceMs: 24 * 60 * 60 * 1000,
      maxSessions: 10,
    });
    expect(results.length).toBe(0);
  });

  it('should respect maxSessions cap', async () => {
    const projectDir = path.join(tmpTranscriptDir, 'C--Users-Eric-Repos-project');
    for (let i = 0; i < 15; i++) {
      const id = `sess-${i.toString().padStart(4, '0')}-0000-0000`;
      await fs.writeFile(
        path.join(projectDir, `${id}.jsonl`),
        `{"type":"user","timestamp":"2026-03-28T10:00:00Z","sessionId":"${id}","message":{"role":"user","content":"hi"}}\n{"type":"last-prompt","lastPrompt":"hi","sessionId":"${id}"}\n`
      );
    }
    const results = await discoverUndigestedSessions({
      transcriptDir: tmpTranscriptDir,
      digestDir: tmpDigestDir,
      sinceMs: 24 * 60 * 60 * 1000,
      maxSessions: 5,
    });
    expect(results.length).toBe(5);
  });
});
