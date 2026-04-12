// test/cli/manage-row.test.ts
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ConstraintRow } from '../../src/tui/ConstraintRow.js';
import type { IndexEntry } from '../../src/storage/digest-store.js';

function makeEntry(overrides: Partial<IndexEntry> = {}): IndexEntry {
  return {
    type: 'decision',
    content: 'Chose React over Vue — because team familiarity',
    keywords: ['react', 'vue'],
    sessionId: 'sess-1',
    timestamp: new Date().toISOString(),
    workingDirectory: '/work/proj',
    ...overrides,
  };
}

describe('ConstraintRow', () => {
  it('renders normally when deleted is false', () => {
    const entry = makeEntry();
    const { lastFrame } = render(
      React.createElement(ConstraintRow, { entry, isFocused: false, deleted: false }),
    );
    const output = lastFrame() ?? '';
    expect(output).toContain('decision');
    expect(output).toContain('Chose React over Vue');
    expect(output).not.toContain('DELETED');
  });

  it('shows DELETED tag when deleted is true', () => {
    const entry = makeEntry();
    const { lastFrame } = render(
      React.createElement(ConstraintRow, { entry, isFocused: false, deleted: true }),
    );
    const output = lastFrame() ?? '';
    expect(output).toContain('DELETED');
    expect(output).toContain('Chose React over Vue');
  });

  it('defaults to not-deleted when the prop is omitted', () => {
    const entry = makeEntry();
    const { lastFrame } = render(
      React.createElement(ConstraintRow, { entry, isFocused: false }),
    );
    const output = lastFrame() ?? '';
    expect(output).not.toContain('DELETED');
  });
});
