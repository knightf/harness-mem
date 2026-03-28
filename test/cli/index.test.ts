import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/cli/digest.js', () => ({
  runDigest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/cli/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    digestDir: '/tmp/digests',
    transcriptDir: '/tmp/transcripts',
    defaultModel: 'test-model',
    defaultProvider: 'anthropic',
    recap: { since: '24h', maxLength: 20000, maxFallbackDigests: 10 },
    clean: { olderThan: '30d' },
  }),
}));

import { runDigest } from '../../src/cli/digest.js';
import { parseStdinPayload, buildProgram } from '../../src/cli/index.js';

const originalIsTTY = process.stdin.isTTY;

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(process.stdin, 'isTTY', {
    value: true,
    configurable: true,
  });
});

afterEach(() => {
  Object.defineProperty(process.stdin, 'isTTY', {
    value: originalIsTTY,
    configurable: true,
  });
});

describe('parseStdinPayload', () => {
  it('should parse valid hook JSON', () => {
    const payload = JSON.stringify({
      session_id: 'abc-123',
      transcript_path: '/path/to/transcript.jsonl',
      cwd: '/project',
      hook_event_name: 'SessionEnd',
    });
    const result = parseStdinPayload(payload);
    expect(result.sessionId).toBe('abc-123');
    expect(result.transcriptPath).toBe('/path/to/transcript.jsonl');
  });

  it('should return null for empty input', () => {
    expect(parseStdinPayload('')).toBeNull();
  });

  it('should return null for invalid JSON', () => {
    expect(parseStdinPayload('not json')).toBeNull();
  });
});

describe('buildProgram', () => {
  it('should register digest, recap, and clean commands', () => {
    const program = buildProgram();
    const commandNames = program.commands.map((c: any) => c.name());
    expect(commandNames).toContain('digest');
    expect(commandNames).toContain('recap');
    expect(commandNames).toContain('clean');
  });

  it('should accept positional transcript path and session ID from CLI', async () => {
    const program = buildProgram();

    await program.parseAsync([
      'node',
      'harness-mem',
      'digest',
      '/tmp/session.jsonl',
      '--session-id',
      'session-123',
    ]);

    expect(runDigest).toHaveBeenCalledTimes(1);
    expect(runDigest).toHaveBeenCalledWith(expect.objectContaining({
      transcriptPath: '/tmp/session.jsonl',
      sessionId: 'session-123',
    }));
  });

});
