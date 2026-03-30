import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runDigest } from '../../src/cli/digest.js';
import { parseDigest } from '../../src/summarizer/formatter.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: `## What you worked on\n\nYou read and edited source files in the project.\n\n## What changed\n\n- Modified \`src/foo.ts\` — updated implementation\n\n## Decisions made\n\n- Chose a simple approach\n\n## Still open\n\n- Nothing noted`,
  }),
}));

let tmpDigestDir: string;
let originalApiKey: string | undefined;

beforeEach(async () => {
  originalApiKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  tmpDigestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-integration-'));
});

afterEach(async () => {
  if (originalApiKey !== undefined) {
    process.env.ANTHROPIC_API_KEY = originalApiKey;
  } else {
    delete process.env.ANTHROPIC_API_KEY;
  }
  await fs.rm(tmpDigestDir, { recursive: true, force: true });
});

describe('Digest Pipeline Integration', () => {
  it('should produce a valid digest from a JSONL transcript', async () => {
    const fixturePath = path.join(__dirname, '../fixtures/traces/sample-session.jsonl');
    await runDigest({
      transcriptPath: fixturePath,
      sessionId: 'integration-test-session',
      digestDir: tmpDigestDir,
      model: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
    });
    const files = await fs.readdir(tmpDigestDir);
    expect(files.length).toBe(1);
    const content = await fs.readFile(path.join(tmpDigestDir, files[0]), 'utf-8');
    const { metadata, body } = parseDigest(content);
    expect(metadata.sessionId).toBe('integration-test-session');
    expect(metadata.model).toBe('claude-haiku-4-5-20251001');
    expect(body).toContain('## What you worked on');
    expect(body).toContain('## What changed');
  });

  it('should be idempotent', async () => {
    const fixturePath = path.join(__dirname, '../fixtures/traces/sample-session.jsonl');
    await runDigest({
      transcriptPath: fixturePath,
      sessionId: 'idem-session',
      digestDir: tmpDigestDir,
      model: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
    });
    await runDigest({
      transcriptPath: fixturePath,
      sessionId: 'idem-session',
      digestDir: tmpDigestDir,
      model: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
    });
    const files = await fs.readdir(tmpDigestDir);
    expect(files.length).toBe(1);
  });
});
