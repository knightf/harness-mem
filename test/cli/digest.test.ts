import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runDigest } from '../../src/cli/digest.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mock the summarizer to avoid real LLM calls
vi.mock('../../src/summarizer/summarizer.js', () => ({
  Summarizer: vi.fn().mockImplementation(function () {
    return {
      summarize: vi.fn().mockResolvedValue({
        summary: 'You did stuff.',
        keywords: ['foo'],
        eliminations: [],
        decisions: [{ chose: 'foo', over: ['bar'], because: 'simpler' }],
        invariants: [],
        preferences: [],
        openThreads: [],
      }),
    };
  }),
}));

let tmpDigestDir: string;

beforeEach(async () => {
  tmpDigestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-digest-'));
});

afterEach(async () => {
  await fs.rm(tmpDigestDir, { recursive: true, force: true });
});

describe('runDigest', () => {
  const fixturePath = path.join(__dirname, '../fixtures/traces/sample-session.jsonl');

  it('should produce a digest file from a transcript', async () => {
    await runDigest({
      transcriptPath: fixturePath,
      sessionId: 'test-session-123',
      digestDir: tmpDigestDir,
      model: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
    });

    const files = await fs.readdir(tmpDigestDir);
    const mdFiles = files.filter((f) => f.endsWith('.md'));
    expect(mdFiles.length).toBe(1);
    expect(mdFiles[0]).toMatch(/\.md$/);

    const content = await fs.readFile(path.join(tmpDigestDir, mdFiles[0]), 'utf-8');
    expect(content).toContain('session_id: test-session-123');
    expect(content).toContain('"summary"');

    // Verify constraint index was also written
    expect(files).toContain('constraints.jsonl');
  });

  it('should skip if digest already exists for session', async () => {
    await runDigest({
      transcriptPath: fixturePath,
      sessionId: 'test-session-123',
      digestDir: tmpDigestDir,
      model: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
    });
    await runDigest({
      transcriptPath: fixturePath,
      sessionId: 'test-session-123',
      digestDir: tmpDigestDir,
      model: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
    });
    const files = await fs.readdir(tmpDigestDir);
    expect(files.filter((f) => f.endsWith('.md')).length).toBe(1);
  });

  it('should overwrite with --force', async () => {
    await runDigest({
      transcriptPath: fixturePath,
      sessionId: 'test-session-123',
      digestDir: tmpDigestDir,
      model: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
    });
    await runDigest({
      transcriptPath: fixturePath,
      sessionId: 'test-session-123',
      digestDir: tmpDigestDir,
      model: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
      force: true,
    });
    const files = await fs.readdir(tmpDigestDir);
    expect(files.filter((f) => f.endsWith('.md')).length).toBe(1);

    // Verify constraint index has no duplicates after force re-digest
    const indexPath = path.join(tmpDigestDir, 'constraints.jsonl');
    const indexContent = await fs.readFile(indexPath, 'utf-8');
    const indexLines = indexContent.trim().split('\n').filter(Boolean);
    const sessionIds = indexLines.map((l) => JSON.parse(l).sessionId);
    const uniqueContents = new Set(indexLines);
    expect(uniqueContents.size).toBe(indexLines.length);
  });

  it('should throw when transcriptPath is empty', async () => {
    await expect(runDigest({
      transcriptPath: '',
      sessionId: 'test',
      digestDir: tmpDigestDir,
      model: 'haiku',
      provider: 'anthropic',
    })).rejects.toThrow('No transcript path provided');
  });

  it('should throw when sessionId is empty', async () => {
    await expect(runDigest({
      transcriptPath: fixturePath,
      sessionId: '',
      digestDir: tmpDigestDir,
      model: 'haiku',
      provider: 'anthropic',
    })).rejects.toThrow('No session ID provided');
  });
});
