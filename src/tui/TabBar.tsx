import React from 'react';
import { Box, Text } from 'ink';
import type { IndexEntry, IndexEntryType } from '../storage/digest-store.js';

// ─── TabBar ──────────────────────────────────────────────────────────────────

const TABS: Array<string> = [
  'all',
  'elimination',
  'decision',
  'invariant',
  'preference',
  'todo',
  'question',
];

interface TabBarProps {
  activeTab: string;
  entries: IndexEntry[];
}

export { TABS };

export function TabBar({ activeTab, entries }: TabBarProps): React.ReactElement {
  return (
    <Box flexDirection="row" gap={1}>
      {TABS.map((tab) => {
        const count = tab === 'all'
          ? entries.length
          : entries.filter((e) => e.type === tab).length;
        const isActive = tab === activeTab;

        return (
          <Text key={tab} bold={isActive} underline={isActive} color={isActive ? 'white' : 'gray'}>
            {tab}({count})
          </Text>
        );
      })}
    </Box>
  );
}
