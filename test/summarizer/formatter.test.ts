import { describe, it, expect } from 'vitest';
import { formatDigest, parseDigest, formatConstraintsToMarkdown, formatRecapToMarkdown } from '../../src/summarizer/formatter.js';
import type { DigestMetadata, SessionConstraints } from '../../src/engine/types.js';

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

describe('formatConstraintsToMarkdown', () => {
  it('should render all populated sections', () => {
    const constraints: SessionConstraints = {
      summary: 'Refactored auth module.',
      keywords: ['auth', 'jwt', 'middleware'],
      eliminations: [{ dont: 'use old SessionStore', because: 'compliance violation' }],
      decisions: [{ chose: 'JWT', over: ['Redis sessions', 'cookie-based'], because: 'stateless + compliant' }],
      invariants: [{ always: 'auth goes through middleware/auth.ts', scope: 'all API routes' }],
      preferences: [{ prefer: 'machine-readable error codes', over: 'human messages', context: 'auth error responses' }],
      openThreads: [{ type: 'todo', what: 'write integration tests', context: 'no coverage for new JWT flow' }],
    };
    const md = formatConstraintsToMarkdown(constraints);
    expect(md).toContain('## Summary');
    expect(md).toContain('Refactored auth module.');
    expect(md).toContain('## Eliminations');
    expect(md).toContain('use old SessionStore');
    expect(md).toContain('## Decisions');
    expect(md).toContain('JWT');
    expect(md).toContain('Redis sessions, cookie-based');
    expect(md).toContain('## Invariants');
    expect(md).toContain('## Preferences');
    expect(md).toContain('## Open Threads');
    expect(md).toContain('[TODO]');
  });

  it('should skip empty sections', () => {
    const constraints: SessionConstraints = {
      summary: 'Quick fix.',
      keywords: [],
      eliminations: [],
      decisions: [],
      invariants: [],
      preferences: [],
      openThreads: [],
    };
    const md = formatConstraintsToMarkdown(constraints);
    expect(md).toContain('## Summary');
    expect(md).not.toContain('## Eliminations');
    expect(md).not.toContain('## Decisions');
    expect(md).not.toContain('## Invariants');
    expect(md).not.toContain('## Preferences');
    expect(md).not.toContain('## Open Threads');
  });

  it('should handle decisions with no stated alternatives', () => {
    const constraints: SessionConstraints = {
      summary: 'Chose X.',
      keywords: ['approach-x'],
      eliminations: [],
      decisions: [{ chose: 'approach X', over: [], because: 'simplest' }],
      invariants: [],
      preferences: [],
      openThreads: [],
    };
    const md = formatConstraintsToMarkdown(constraints);
    expect(md).toContain('no stated alternatives');
  });
});

describe('formatRecapToMarkdown', () => {
  it('should only render summary and open threads', () => {
    const constraints: SessionConstraints = {
      summary: 'Refactored auth module.',
      keywords: ['auth', 'jwt'],
      eliminations: [{ dont: 'use old SessionStore', because: 'compliance violation' }],
      decisions: [{ chose: 'JWT', over: ['Redis sessions'], because: 'stateless' }],
      invariants: [{ always: 'auth goes through middleware', scope: 'all routes' }],
      preferences: [{ prefer: 'error codes', over: 'messages', context: 'auth responses' }],
      openThreads: [{ type: 'todo', what: 'write integration tests', context: 'no coverage' }],
    };
    const md = formatRecapToMarkdown(constraints);
    expect(md).toContain('## Summary');
    expect(md).toContain('Refactored auth module.');
    expect(md).toContain('## Open Threads');
    expect(md).toContain('[TODO]');
    // Constraints should NOT appear in recap
    expect(md).not.toContain('## Eliminations');
    expect(md).not.toContain('## Decisions');
    expect(md).not.toContain('## Invariants');
    expect(md).not.toContain('## Preferences');
  });

  it('should render only summary when no open threads', () => {
    const constraints: SessionConstraints = {
      summary: 'Quick fix.',
      keywords: [],
      eliminations: [{ dont: 'something', because: 'reason' }],
      decisions: [],
      invariants: [],
      preferences: [],
      openThreads: [],
    };
    const md = formatRecapToMarkdown(constraints);
    expect(md).toContain('## Summary');
    expect(md).not.toContain('## Open Threads');
    expect(md).not.toContain('## Eliminations');
  });
});
