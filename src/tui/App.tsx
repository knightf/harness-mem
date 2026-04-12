import React, { useState, useCallback, useMemo } from 'react';
import path from 'node:path';
import { Box, Text, useApp, useInput } from 'ink';
import { TabBar, TABS } from './TabBar.js';
import { ConstraintList } from './ConstraintList.js';
import { SearchInput } from './SearchInput.js';
import { useConstraints } from './useConstraints.js';
import type { ScoredEntry } from './useConstraints.js';
import { DetailPane } from './DetailPane.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type AppMode = 'browse' | 'search' | 'simulation';

// ─── App ─────────────────────────────────────────────────────────────────────

interface AppProps {
  digestDir: string;
  cwd: string;
}

export function App({ digestDir, cwd }: AppProps): React.ReactElement {
  const app = useApp();
  const {
    entries,
    loading,
    error,
    dirty,
    toggleDisabled,
    toggleShared,
    save,
    filterByTab,
    filterByProject,
    filterBySearch,
    simulateRecall,
  } = useConstraints(digestDir, cwd);

  const [activeTab, setActiveTab] = useState('all');
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<AppMode>('browse');
  const [inputValue, setInputValue] = useState('');
  const [filteredItems, setFilteredItems] = useState<ScoredEntry[] | null>(null);
  const [detailVisible, setDetailVisible] = useState(true);
  const [projectFilterEnabled, setProjectFilterEnabled] = useState(false);

  // Compute the entry pool — when project filter is on, narrow to current project + shared
  // (preserves original indices via the same `entries` array, since filterByProject keeps identity)
  const scopedEntries = useMemo(
    () => (projectFilterEnabled ? filterByProject(entries) : entries),
    [projectFilterEnabled, entries, filterByProject],
  );

  // Build display items: filtered (search/sim) results, else tab filter applied to scopedEntries.
  // For tab filtering we need indices into the original `entries` array so toggle still works.
  const displayItems: ScoredEntry[] = useMemo(() => {
    if (filteredItems) return filteredItems;
    const result: ScoredEntry[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (activeTab !== 'all' && entry.type !== activeTab) continue;
      if (projectFilterEnabled && !entry.shared && !scopedEntries.includes(entry)) continue;
      result.push({ entry, index: i });
    }
    return result;
  }, [filteredItems, entries, activeTab, projectFilterEnabled, scopedEntries]);

  const clampCursor = useCallback((items: ScoredEntry[], cur: number) => {
    return Math.max(0, Math.min(cur, items.length - 1));
  }, []);

  // Handle search/simulation submit
  const handleInputSubmit = useCallback((value: string) => {
    if (!value.trim()) {
      setMode('browse');
      setInputValue('');
      setFilteredItems(null);
      return;
    }

    let results: ScoredEntry[];
    if (mode === 'search') {
      // Search within the currently visible (tab + project filter) entries
      const visibleEntries = displayItems.map((s) => s.entry);
      const visibleIndices = displayItems.map((s) => s.index);
      results = filterBySearch(value, visibleEntries).map((s) => ({
        ...s,
        index: visibleIndices[s.index] ?? s.index,
      }));
    } else {
      // Simulation: run recall logic against the project-scoped pool so results
      // match exactly what `harness-mem recall` would return for this project.
      const pool = projectFilterEnabled ? scopedEntries : entries;
      const poolIndices = projectFilterEnabled
        ? scopedEntries.map((e) => entries.indexOf(e))
        : entries.map((_, i) => i);
      results = simulateRecall(value, pool).map((s) => ({
        ...s,
        index: poolIndices[s.index] ?? s.index,
      }));
    }

    setFilteredItems(results);
    setCursor(0);
    setMode('browse');
    setInputValue('');
  }, [mode, entries, scopedEntries, projectFilterEnabled, displayItems, filterBySearch, simulateRecall]);

  useInput((input, key) => {
    // In input mode, only Escape is handled here
    if (mode !== 'browse') {
      if (key.escape) {
        setMode('browse');
        setInputValue('');
        // Don't clear filtered items on escape from input — user may want to keep results
      }
      return;
    }

    // Browse mode keys
    if (input === 'q') {
      if (dirty) {
        save().then(() => app.exit());
      } else {
        app.exit();
      }
      return;
    }

    if (key.escape) {
      if (filteredItems) {
        // Clear search/simulation results
        setFilteredItems(null);
        setCursor(0);
      } else {
        if (dirty) {
          save().then(() => app.exit());
        } else {
          app.exit();
        }
      }
      return;
    }

    if (key.tab) {
      const dir = key.shift ? -1 : 1;
      const currentIdx = TABS.indexOf(activeTab);
      const nextIdx = (currentIdx + dir + TABS.length) % TABS.length;
      setActiveTab(TABS[nextIdx]);
      setFilteredItems(null);
      setCursor(0);
      return;
    }

    if (key.upArrow || input === 'k') {
      setCursor((c) => clampCursor(displayItems, c - 1));
      return;
    }

    if (key.downArrow || input === 'j') {
      setCursor((c) => clampCursor(displayItems, c + 1));
      return;
    }

    if (input === ' ') {
      const item = displayItems[cursor];
      if (item) {
        toggleDisabled(item.index);
      }
      return;
    }

    if (input === 'g') {
      const item = displayItems[cursor];
      if (item) {
        toggleShared(item.index);
      }
      return;
    }

    if (input === 'P') {
      setProjectFilterEnabled((v) => !v);
      setFilteredItems(null);
      setCursor(0);
      return;
    }

    if (input === '/') {
      setMode('search');
      setInputValue('');
      return;
    }

    if (input === 's') {
      setMode('simulation');
      setInputValue('');
      return;
    }

    if (input === 'p') {
      setDetailVisible((v) => !v);
      return;
    }
  });

  if (loading) {
    return <Text color="gray">Loading constraints…</Text>;
  }

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  const projectBasename = path.basename(cwd) || cwd;

  return (
    <Box flexDirection="column" gap={0}>
      {/* Header */}
      <Box>
        <Text bold color="cyan">Constraint Control Panel</Text>
        {dirty && <Text color="yellow"> [modified]</Text>}
        <Text color="gray"> — {entries.length} total</Text>
        <Text color="gray"> | project: </Text>
        <Text color="magentaBright">{projectBasename}</Text>
        {projectFilterEnabled && <Text color="green" bold> [scoped]</Text>}
      </Box>

      {/* Tab bar — counts reflect the active project filter */}
      <TabBar activeTab={activeTab} entries={scopedEntries} />

      {/* Search/simulation input */}
      {mode !== 'browse' && (
        <SearchInput
          mode={mode}
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleInputSubmit}
        />
      )}

      {/* Filter indicator */}
      {filteredItems && mode === 'browse' && (
        <Text color="yellow">
          Showing {filteredItems.length} result(s) — press Escape to clear
        </Text>
      )}

      {/* Constraint list */}
      <ConstraintList items={displayItems} cursor={cursor} />

      {/* Detail pane */}
      <DetailPane
        entry={displayItems[cursor]?.entry ?? null}
        visible={detailVisible}
      />

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray">
          Tab: type | ↑↓/jk: nav | Space: enable | g: shared | P: project filter | p: detail | /: search | s: simulate | q: save & quit
        </Text>
      </Box>
    </Box>
  );
}
