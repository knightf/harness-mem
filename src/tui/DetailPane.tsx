// src/tui/DetailPane.tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { IndexEntry, IndexEntryType } from '../storage/digest-store.js';

const TYPE_COLORS: Record<IndexEntryType, string> = {
  elimination: 'red',
  decision: 'blue',
  invariant: 'green',
  preference: 'yellow',
  todo: 'magenta',
  question: 'cyan',
};

interface DetailPaneProps {
  entry: IndexEntry | null;
  visible: boolean;
}

export function DetailPane({ entry, visible }: DetailPaneProps): React.ReactElement | null {
  if (!visible || !entry) return null;

  const color = TYPE_COLORS[entry.type] ?? 'white';
  const hasKeywords = entry.keywords && entry.keywords.length > 0;

  return (
    <Box flexDirection="column" marginTop={0}>
      <Text color="gray">{'┈'.repeat(process.stdout.columns || 80)}</Text>
      <Text color={color} bold>[{entry.type}]</Text>
      <Text wrap="wrap">{entry.content}</Text>
      {hasKeywords && (
        <Text color="gray" dimColor>keywords: {entry.keywords.join(', ')}</Text>
      )}
      <Text color="gray">{'┈'.repeat(process.stdout.columns || 80)}</Text>
    </Box>
  );
}
