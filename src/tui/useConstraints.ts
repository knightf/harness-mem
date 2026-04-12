import { useState, useEffect, useCallback, useRef } from 'react';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { matchesProject, type IndexEntry } from '../storage/digest-store.js';
import { extractTerms, scoreMatch } from '../cli/recall.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScoredEntry {
  entry: IndexEntry;
  index: number;
  score?: number;
}

export interface UseConstraintsResult {
  entries: IndexEntry[];
  loading: boolean;
  error: string | null;
  dirty: boolean;
  toggleDisabled: (originalIndex: number) => void;
  toggleShared: (originalIndex: number) => void;
  save: () => Promise<void>;
  filterByTab: (tab: string, entries: IndexEntry[]) => ScoredEntry[];
  filterByProject: (entries: IndexEntry[]) => IndexEntry[];
  filterBySearch: (query: string, entries: IndexEntry[]) => ScoredEntry[];
  simulateRecall: (prompt: string, entries: IndexEntry[]) => ScoredEntry[];
}

// ─── Pure helpers (exported for testing) ─────────────────────────────────────

export function loadConstraintsFromString(content: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as IndexEntry;
      if (entry.type === 'todo' || entry.type === 'question') continue;
      entries.push(entry);
    } catch { /* skip malformed */ }
  }
  return entries;
}

export function filterByTab(tab: string, entries: IndexEntry[]): ScoredEntry[] {
  const result: ScoredEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (tab === 'all' || entries[i].type === tab) {
      result.push({ entry: entries[i], index: i });
    }
  }
  return result;
}

/**
 * Returns only entries belonging to the current project. An entry "belongs" to
 * the current project if its workingDirectory matches (prefix-aware) OR if it
 * is marked as globally shared. Preserves entry identity (no copies).
 */
export function filterByProject(entries: IndexEntry[], currentCwd: string): IndexEntry[] {
  const result: IndexEntry[] = [];
  for (const entry of entries) {
    if (entry.shared) {
      result.push(entry);
      continue;
    }
    if (matchesProject(entry.workingDirectory, currentCwd)) {
      result.push(entry);
    }
  }
  return result;
}

export function filterBySearch(query: string, entries: IndexEntry[]): ScoredEntry[] {
  if (!query.trim()) {
    return entries.map((entry, index) => ({ entry, index }));
  }

  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (keywords.length === 0) {
    return entries.map((entry, index) => ({ entry, index }));
  }

  const result: ScoredEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const entryKeywords = (entry.keywords ?? []).map((k) => k.toLowerCase());
    const contentLower = entry.content.toLowerCase();

    const matches = keywords.every((kw) =>
      entryKeywords.some((ek) => ek.includes(kw)) || contentLower.includes(kw),
    );

    if (matches) {
      result.push({ entry, index: i });
    }
  }
  return result;
}

export function simulateRecall(prompt: string, entries: IndexEntry[]): ScoredEntry[] {
  const terms = extractTerms(prompt);
  if (terms.length === 0) return [];

  const scored: ScoredEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.disabled) continue;
    const score = scoreMatch(terms, entry);
    if (score > 0) {
      scored.push({ entry, index: i, score });
    }
  }

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return scored;
}

// ─── Deleted-aware helpers (exported for testing) ────────────────────────────

/**
 * Returns only entries whose original index is NOT in the deleted set.
 * Used by the hook's save() path to write the post-delete jsonl.
 */
export function filterKeptEntries(
  entries: IndexEntry[],
  deletedIndices: Set<number>,
): IndexEntry[] {
  return entries.filter((_, i) => !deletedIndices.has(i));
}

/**
 * Given a pool of entries (possibly a subset of the full `entries` array, e.g.
 * project-filtered), remove any entry whose original-array index is in
 * `deletedIndices`. Returns the filtered pool along with a mapping so the
 * caller can remap result indices back to positions in the original input.
 *
 * NOTE: callers must pass `input` entries that are reference-equal to their
 * counterparts in `entries` (i.e. no deep copies). Orphan entries that are
 * not found in `entries` are passed through unchanged.
 */
export function filterDeletedFromPool(
  input: IndexEntry[],
  entries: IndexEntry[],
  deletedIndices: Set<number>,
): { pool: IndexEntry[]; poolToInputIdx: number[] } {
  const pool: IndexEntry[] = [];
  const poolToInputIdx: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const originalIdx = entries.indexOf(input[i]);
    if (originalIdx !== -1 && deletedIndices.has(originalIdx)) continue;
    pool.push(input[i]);
    poolToInputIdx.push(i);
  }
  return { pool, poolToInputIdx };
}

export async function saveConstraints(indexPath: string, entries: IndexEntry[]): Promise<void> {
  const content = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  const tmpPath = indexPath + '.tmp';
  await fsp.writeFile(tmpPath, content, 'utf-8');
  await fsp.rename(tmpPath, indexPath);
}

// ─── React hook ──────────────────────────────────────────────────────────────

export function useConstraints(digestDir: string, currentCwd: string): UseConstraintsResult {
  const [entries, setEntries] = useState<IndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const indexPath = path.join(digestDir, 'constraints.jsonl');

  useEffect(() => {
    fsp.readFile(indexPath, 'utf-8')
      .then((content) => {
        setEntries(loadConstraintsFromString(content));
        setLoading(false);
      })
      .catch((err) => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          setEntries([]);
        } else {
          setError(String(err));
        }
        setLoading(false);
      });
  }, [indexPath]);

  const toggleDisabled = useCallback((originalIndex: number) => {
    setEntries((prev) => {
      const next = [...prev];
      next[originalIndex] = { ...next[originalIndex], disabled: !next[originalIndex].disabled };
      return next;
    });
    setDirty(true);
  }, []);

  const toggleShared = useCallback((originalIndex: number) => {
    setEntries((prev) => {
      const next = [...prev];
      next[originalIndex] = { ...next[originalIndex], shared: !next[originalIndex].shared };
      return next;
    });
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    await saveConstraints(indexPath, entries);
    setDirty(false);
  }, [indexPath, entries]);

  const filterByProjectBound = useCallback(
    (input: IndexEntry[]) => filterByProject(input, currentCwd),
    [currentCwd],
  );

  return {
    entries,
    loading,
    error,
    dirty,
    toggleDisabled,
    toggleShared,
    save,
    filterByTab,
    filterByProject: filterByProjectBound,
    filterBySearch,
    simulateRecall,
  };
}
