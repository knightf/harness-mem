import { useState, useEffect, useCallback, useRef } from 'react';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { IndexEntry } from '../storage/digest-store.js';
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
  save: () => Promise<void>;
  filterByTab: (tab: string, entries: IndexEntry[]) => ScoredEntry[];
  filterBySearch: (query: string, entries: IndexEntry[]) => ScoredEntry[];
  simulateRecall: (prompt: string, entries: IndexEntry[]) => ScoredEntry[];
}

// ─── Pure helpers (exported for testing) ─────────────────────────────────────

export function loadConstraintsFromString(content: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as IndexEntry);
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

export async function saveConstraints(indexPath: string, entries: IndexEntry[]): Promise<void> {
  const content = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  const tmpPath = indexPath + '.tmp';
  await fsp.writeFile(tmpPath, content, 'utf-8');
  await fsp.rename(tmpPath, indexPath);
}

// ─── React hook ──────────────────────────────────────────────────────────────

export function useConstraints(digestDir: string): UseConstraintsResult {
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

  const save = useCallback(async () => {
    await saveConstraints(indexPath, entries);
    setDirty(false);
  }, [indexPath, entries]);

  return {
    entries,
    loading,
    error,
    dirty,
    toggleDisabled,
    save,
    filterByTab,
    filterBySearch,
    simulateRecall,
  };
}
