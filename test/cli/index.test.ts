import { describe, it, expect, vi } from 'vitest';
import { parseStdinPayload, buildProgram } from '../../src/cli/index.js';

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
});
