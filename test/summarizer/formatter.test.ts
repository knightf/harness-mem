import { describe, it, expect } from 'vitest';
import { formatDigest, parseDigest } from '../../src/summarizer/formatter.js';
import type { DigestMetadata } from '../../src/engine/types.js';

describe('formatDigest', () => {
  it('should format metadata as YAML frontmatter with body', () => {
    const metadata: DigestMetadata = {
      sessionId: 'abc-123',
      timestamp: '2026-03-28T14:30:00Z',
      durationMinutes: 45,
      model: 'claude-haiku-4-5-20251001',
      workingDirectory: '/home/user/project',
    };
    const body = '## What you worked on\n\nYou did stuff.';
    const result = formatDigest(metadata, body);
    expect(result).toContain('---');
    expect(result).toContain('session_id: abc-123');
    expect(result).toContain('duration_minutes: 45');
    expect(result).toContain('## What you worked on');
  });
});

describe('parseDigest', () => {
  it('should parse frontmatter and body from digest markdown', () => {
    const input = `---
session_id: abc-123
timestamp: 2026-03-28T14:30:00Z
duration_minutes: 45
model: claude-haiku-4-5-20251001
working_directory: /home/user/project
---

## What you worked on

You did stuff.`;

    const { metadata, body } = parseDigest(input);
    expect(metadata.sessionId).toBe('abc-123');
    expect(metadata.durationMinutes).toBe(45);
    expect(body).toContain('## What you worked on');
  });
});
