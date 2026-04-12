// test/cli/manage-detail-pane.test.ts
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { DetailPane } from '../../src/tui/DetailPane.js';
import type { IndexEntry } from '../../src/storage/digest-store.js';

function makeEntry(overrides: Partial<IndexEntry> = {}): IndexEntry {
  return {
    type: 'decision',
    content: 'Chose PostgreSQL over MySQL, SQLite — because it supports JSONB columns and full-text search',
    keywords: ['database', 'storage', 'postgresql'],
    sessionId: 'sess-1',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('DetailPane', () => {
  it('renders full content when visible with an entry', () => {
    const entry = makeEntry();
    const { lastFrame } = render(
      React.createElement(DetailPane, { entry, visible: true }),
    );
    const output = lastFrame() ?? '';
    expect(output).toContain('decision');
    expect(output).toContain('Chose PostgreSQL over MySQL, SQLite');
    expect(output).toContain('JSONB columns and full-text search');
    expect(output).toContain('database');
    expect(output).toContain('storage');
    expect(output).toContain('postgresql');
  });

  it('renders nothing when visible is false', () => {
    const entry = makeEntry();
    const { lastFrame } = render(
      React.createElement(DetailPane, { entry, visible: false }),
    );
    const output = lastFrame() ?? '';
    expect(output).toBe('');
  });

  it('renders nothing when entry is null', () => {
    const { lastFrame } = render(
      React.createElement(DetailPane, { entry: null, visible: true }),
    );
    const output = lastFrame() ?? '';
    expect(output).toBe('');
  });

  it('shows type-specific color label for elimination', () => {
    const entry = makeEntry({ type: 'elimination', content: "Don't use eval — because security" });
    const { lastFrame } = render(
      React.createElement(DetailPane, { entry, visible: true }),
    );
    const output = lastFrame() ?? '';
    expect(output).toContain('elimination');
    expect(output).toContain("Don't use eval");
  });

  it('shows keywords as comma-separated list', () => {
    const entry = makeEntry({ keywords: ['alpha', 'beta', 'gamma'] });
    const { lastFrame } = render(
      React.createElement(DetailPane, { entry, visible: true }),
    );
    const output = lastFrame() ?? '';
    expect(output).toContain('alpha, beta, gamma');
  });

  it('handles entry with empty keywords array', () => {
    const entry = makeEntry({ keywords: [] });
    const { lastFrame } = render(
      React.createElement(DetailPane, { entry, visible: true }),
    );
    const output = lastFrame() ?? '';
    // Should still render content, just no keywords line
    expect(output).toContain('Chose PostgreSQL');
    expect(output).not.toContain('keywords:');
  });

  it('shows full workingDirectory path and shared status', () => {
    const entry = makeEntry({ workingDirectory: '/work/example-project', shared: true });
    const { lastFrame } = render(
      React.createElement(DetailPane, { entry, visible: true }),
    );
    const output = lastFrame() ?? '';
    expect(output).toContain('/work/example-project');
    expect(output).toContain('shared globally:');
    expect(output).toContain('yes');
  });

  it('shows (unknown) when workingDirectory is missing', () => {
    const entry = makeEntry({ workingDirectory: undefined });
    const { lastFrame } = render(
      React.createElement(DetailPane, { entry, visible: true }),
    );
    const output = lastFrame() ?? '';
    expect(output).toContain('(unknown)');
  });

  it('shows shared as no by default', () => {
    const entry = makeEntry();
    const { lastFrame } = render(
      React.createElement(DetailPane, { entry, visible: true }),
    );
    const output = lastFrame() ?? '';
    expect(output).toContain('shared globally:');
    expect(output).toContain('no');
  });

  it('does not show the DELETED status line when deleted is false', () => {
    const entry = makeEntry();
    const { lastFrame } = render(
      React.createElement(DetailPane, { entry, visible: true, deleted: false }),
    );
    const output = lastFrame() ?? '';
    expect(output).not.toContain('DELETED');
  });

  it('shows a red DELETED status line when deleted is true', () => {
    const entry = makeEntry();
    const { lastFrame } = render(
      React.createElement(DetailPane, { entry, visible: true, deleted: true }),
    );
    const output = lastFrame() ?? '';
    expect(output).toContain('status:');
    expect(output).toContain('DELETED');
    expect(output).toContain('will be removed on save');
  });

  it('defaults to not-deleted when prop is omitted', () => {
    const entry = makeEntry();
    const { lastFrame } = render(
      React.createElement(DetailPane, { entry, visible: true }),
    );
    const output = lastFrame() ?? '';
    expect(output).not.toContain('status:');
  });
});
