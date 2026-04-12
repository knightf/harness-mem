import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { IndexEntry } from '../../src/storage/digest-store.js';
import {
  loadConstraintsFromString,
  filterByTab,
  filterByProject,
  filterBySearch,
  simulateRecall,
  saveConstraints,
  filterKeptEntries,
  filterDeletedFromPool,
} from '../../src/tui/useConstraints.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ENTRIES: IndexEntry[] = [
  { type: 'elimination', content: "Don't use eval — because security risk", keywords: ['eval', 'security'], sessionId: 's1', timestamp: '2026-04-01T10:00:00Z' },
  { type: 'decision', content: 'Chose React over Vue — because team familiarity', keywords: ['react', 'vue', 'frontend'], sessionId: 's1', timestamp: '2026-04-01T10:00:00Z' },
  { type: 'invariant', content: 'Always use TypeScript — scope: all source files', keywords: ['typescript', 'types'], sessionId: 's2', timestamp: '2026-04-02T10:00:00Z' },
  { type: 'preference', content: 'Prefer ESM over CJS — context: Node.js projects', keywords: ['esm', 'cjs', 'modules'], sessionId: 's2', timestamp: '2026-04-02T10:00:00Z' },
];

function makeJsonl(entries: IndexEntry[]): string {
  return entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-tui-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ─── loadConstraintsFromString ───────────────────────────────────────────────

describe('loadConstraintsFromString', () => {
  it('should parse JSONL correctly', () => {
    const result = loadConstraintsFromString(makeJsonl(ENTRIES));
    expect(result).toHaveLength(4);
    expect(result[0].type).toBe('elimination');
    expect(result[3].type).toBe('preference');
  });

  it('should handle empty string', () => {
    expect(loadConstraintsFromString('')).toHaveLength(0);
  });

  it('should skip malformed lines', () => {
    const content = JSON.stringify(ENTRIES[0]) + '\n{bad json\n' + JSON.stringify(ENTRIES[1]) + '\n';
    const result = loadConstraintsFromString(content);
    expect(result).toHaveLength(2);
  });
});

// ─── filterByTab ─────────────────────────────────────────────────────────────

describe('filterByTab', () => {
  it('should return all entries for "all" tab', () => {
    const result = filterByTab('all', ENTRIES);
    expect(result).toHaveLength(4);
  });

  it('should filter by specific type', () => {
    const result = filterByTab('elimination', ENTRIES);
    expect(result).toHaveLength(1);
    expect(result[0].entry.type).toBe('elimination');
  });

  it('should preserve original index', () => {
    const result = filterByTab('preference', ENTRIES);
    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(3);
  });
});

// ─── filterBySearch ──────────────────────────────────────────────────────────

describe('filterBySearch', () => {
  it('should return all entries for empty query', () => {
    const result = filterBySearch('', ENTRIES);
    expect(result).toHaveLength(4);
  });

  it('should match keyword existence', () => {
    const result = filterBySearch('react', ENTRIES);
    expect(result).toHaveLength(1);
    expect(result[0].entry.content).toContain('React');
  });

  it('should not match non-existent keyword', () => {
    const result = filterBySearch('angular', ENTRIES);
    expect(result).toHaveLength(0);
  });

  it('should be case-insensitive', () => {
    const result = filterBySearch('React', ENTRIES);
    expect(result).toHaveLength(1);
  });

  it('should match content substring', () => {
    const result = filterBySearch('typescript', ENTRIES);
    expect(result).toHaveLength(1);
    expect(result[0].entry.type).toBe('invariant');
  });

  it('should require all keywords to match', () => {
    const result = filterBySearch('react vue', ENTRIES);
    expect(result).toHaveLength(1);
    expect(result[0].entry.content).toContain('React over Vue');
  });

  it('should not return scored results (no score property)', () => {
    const result = filterBySearch('react', ENTRIES);
    expect(result[0].score).toBeUndefined();
  });
});

// ─── simulateRecall ──────────────────────────────────────────────────────────

describe('simulateRecall', () => {
  it('should use extractTerms + scoreMatch and return scored results', () => {
    const result = simulateRecall('fix the security eval vulnerability', ENTRIES);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].score).toBeDefined();
    expect(result[0].score!).toBeGreaterThan(0);
  });

  it('should sort by score descending', () => {
    const result = simulateRecall('react vue frontend typescript modules', ENTRIES);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score!).toBeGreaterThanOrEqual(result[i].score!);
    }
  });

  it('should exclude disabled entries', () => {
    const withDisabled: IndexEntry[] = [
      { ...ENTRIES[0], disabled: true },
      ...ENTRIES.slice(1),
    ];
    const result = simulateRecall('eval security', withDisabled);
    const hasDisabled = result.some((r) => r.entry.content.includes('eval'));
    expect(hasDisabled).toBe(false);
  });

  it('should return empty for empty prompt', () => {
    const result = simulateRecall('', ENTRIES);
    expect(result).toHaveLength(0);
  });
});

// ─── saveConstraints ─────────────────────────────────────────────────────────

describe('saveConstraints', () => {
  it('should write entries atomically', async () => {
    const indexPath = path.join(tmpDir, 'constraints.jsonl');
    await saveConstraints(indexPath, ENTRIES);

    const content = await fs.readFile(indexPath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(4);

    const first: IndexEntry = JSON.parse(lines[0]);
    expect(first.type).toBe('elimination');

    // Temp file should be cleaned up
    const files = await fs.readdir(tmpDir);
    expect(files).not.toContain('constraints.jsonl.tmp');
  });

  it('should persist disabled flag', async () => {
    const indexPath = path.join(tmpDir, 'constraints.jsonl');
    const modified = [{ ...ENTRIES[0], disabled: true }, ...ENTRIES.slice(1)];
    await saveConstraints(indexPath, modified);

    const content = await fs.readFile(indexPath, 'utf-8');
    const first: IndexEntry = JSON.parse(content.split('\n')[0]);
    expect(first.disabled).toBe(true);
  });

  it('should persist shared and workingDirectory fields', async () => {
    const indexPath = path.join(tmpDir, 'constraints.jsonl');
    const modified: IndexEntry[] = [
      { ...ENTRIES[0], shared: true, workingDirectory: '/work/proj-a' },
      ...ENTRIES.slice(1),
    ];
    await saveConstraints(indexPath, modified);

    const content = await fs.readFile(indexPath, 'utf-8');
    const first: IndexEntry = JSON.parse(content.split('\n')[0]);
    expect(first.shared).toBe(true);
    expect(first.workingDirectory).toBe('/work/proj-a');
  });
});

// ─── filterByProject ─────────────────────────────────────────────────────────

describe('filterByProject', () => {
  const PROJECT_A = '/work/proj-a';
  const PROJECT_B = '/work/proj-b';

  const SCOPED_ENTRIES: IndexEntry[] = [
    { type: 'elimination', content: 'A1', keywords: [], sessionId: 's', timestamp: 't', workingDirectory: PROJECT_A },
    { type: 'decision', content: 'B1', keywords: [], sessionId: 's', timestamp: 't', workingDirectory: PROJECT_B },
    { type: 'invariant', content: 'shared-no-wd', keywords: [], sessionId: 's', timestamp: 't', shared: true },
    { type: 'preference', content: 'A2-shared', keywords: [], sessionId: 's', timestamp: 't', workingDirectory: PROJECT_A, shared: true },
    { type: 'elimination', content: 'legacy-no-wd', keywords: [], sessionId: 's', timestamp: 't' },
  ];

  it('returns entries matching the current project', () => {
    const result = filterByProject(SCOPED_ENTRIES, PROJECT_A);
    expect(result.map((e) => e.content)).toContain('A1');
    expect(result.map((e) => e.content)).toContain('A2-shared');
  });

  it('always includes shared entries regardless of project', () => {
    const fromB = filterByProject(SCOPED_ENTRIES, PROJECT_B);
    expect(fromB.map((e) => e.content)).toContain('shared-no-wd');
    expect(fromB.map((e) => e.content)).toContain('A2-shared');
    expect(fromB.map((e) => e.content)).toContain('B1');
  });

  it('excludes legacy entries without workingDirectory and not shared', () => {
    const fromA = filterByProject(SCOPED_ENTRIES, PROJECT_A);
    expect(fromA.map((e) => e.content)).not.toContain('legacy-no-wd');
  });

  it('matches subdirectories of the stored project (prefix-aware)', () => {
    const result = filterByProject(SCOPED_ENTRIES, path.join(PROJECT_A, 'src'));
    expect(result.map((e) => e.content)).toContain('A1');
  });

  it('preserves entry identity (no copies)', () => {
    const result = filterByProject(SCOPED_ENTRIES, PROJECT_A);
    expect(result[0]).toBe(SCOPED_ENTRIES[0]);
  });
});

// ─── filterKeptEntries ───────────────────────────────────────────────────────

describe('filterKeptEntries', () => {
  it('returns all entries when nothing is deleted', () => {
    const result = filterKeptEntries(ENTRIES, new Set());
    expect(result).toHaveLength(ENTRIES.length);
    expect(result).toEqual(ENTRIES);
  });

  it('filters out entries whose index is in the set', () => {
    const result = filterKeptEntries(ENTRIES, new Set([0, 2]));
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('decision');
    expect(result[1].type).toBe('preference');
  });

  it('returns empty array when all indices are deleted', () => {
    const result = filterKeptEntries(ENTRIES, new Set([0, 1, 2, 3]));
    expect(result).toHaveLength(0);
  });

  it('ignores out-of-range indices in the set', () => {
    const result = filterKeptEntries(ENTRIES, new Set([99]));
    expect(result).toHaveLength(ENTRIES.length);
  });
});

// ─── filterDeletedFromPool ───────────────────────────────────────────────────

describe('filterDeletedFromPool', () => {
  it('returns the whole input when nothing is deleted', () => {
    const { pool, poolToInputIdx } = filterDeletedFromPool(ENTRIES, ENTRIES, new Set());
    expect(pool).toHaveLength(ENTRIES.length);
    expect(poolToInputIdx).toEqual([0, 1, 2, 3]);
  });

  it('drops entries whose original index is in the deleted set', () => {
    const { pool, poolToInputIdx } = filterDeletedFromPool(ENTRIES, ENTRIES, new Set([1]));
    expect(pool).toHaveLength(3);
    expect(pool.map((e) => e.type)).toEqual(['elimination', 'invariant', 'preference']);
    expect(poolToInputIdx).toEqual([0, 2, 3]);
  });

  it('handles an input that is a subset of entries (project-filtered pool)', () => {
    const subset = [ENTRIES[1], ENTRIES[3]];
    const { pool, poolToInputIdx } = filterDeletedFromPool(subset, ENTRIES, new Set([3]));
    expect(pool).toHaveLength(1);
    expect(pool[0]).toBe(ENTRIES[1]);
    expect(poolToInputIdx).toEqual([0]);
  });

  it('returns empty pool when the entire input is deleted', () => {
    const { pool, poolToInputIdx } = filterDeletedFromPool(ENTRIES, ENTRIES, new Set([0, 1, 2, 3]));
    expect(pool).toHaveLength(0);
    expect(poolToInputIdx).toEqual([]);
  });
});
