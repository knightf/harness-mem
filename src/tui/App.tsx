import React, { useState, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { TabBar, TABS } from './TabBar.js';
import { ConstraintList } from './ConstraintList.js';
import { SearchInput } from './SearchInput.js';
import { useConstraints } from './useConstraints.js';
import type { ScoredEntry } from './useConstraints.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type AppMode = 'browse' | 'search' | 'simulation';

// ─── App ─────────────────────────────────────────────────────────────────────

interface AppProps {
  digestDir: string;
}

export function App({ digestDir }: AppProps): React.ReactElement {
  const app = useApp();
  const {
    entries,
    loading,
    error,
    dirty,
    toggleDisabled,
    save,
    filterByTab,
    filterBySearch,
    simulateRecall,
  } = useConstraints(digestDir);

  const [activeTab, setActiveTab] = useState('all');
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<AppMode>('browse');
  const [inputValue, setInputValue] = useState('');
  const [filteredItems, setFilteredItems] = useState<ScoredEntry[] | null>(null);

  // Compute display items
  const displayItems: ScoredEntry[] = filteredItems ?? filterByTab(activeTab, entries);

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
      const tabFiltered = filterByTab(activeTab, entries);
      const tabEntries = tabFiltered.map((s) => s.entry);
      results = filterBySearch(value, tabEntries).map((s) => ({
        ...s,
        index: tabFiltered[s.index]?.index ?? s.index,
      }));
    } else {
      results = simulateRecall(value, entries);
    }

    setFilteredItems(results);
    setCursor(0);
    setMode('browse');
    setInputValue('');
  }, [mode, activeTab, entries, filterByTab, filterBySearch, simulateRecall]);

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
  });

  if (loading) {
    return <Text color="gray">Loading constraints…</Text>;
  }

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  return (
    <Box flexDirection="column" gap={0}>
      {/* Header */}
      <Box>
        <Text bold color="cyan">Constraint Control Panel</Text>
        {dirty && <Text color="yellow"> [modified]</Text>}
        <Text color="gray"> — {entries.length} total</Text>
      </Box>

      {/* Tab bar */}
      <TabBar activeTab={activeTab} entries={entries} />

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

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray">
          Tab: switch type | ↑↓/jk: navigate | Space: toggle | /: search | s: simulate | q: save & quit
        </Text>
      </Box>
    </Box>
  );
}
