// src/tui/DetailPane.tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { IndexEntry } from '../storage/digest-store.js';
import { TYPE_COLORS } from './typeColors.js';

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
        <Text color="white">keywords: {entry.keywords.join(', ')}</Text>
      )}
      <Text color="white">
        project: <Text color="magentaBright">{entry.workingDirectory || '(unknown)'}</Text>
      </Text>
      <Text color="white">
        shared globally: <Text color={entry.shared ? 'cyanBright' : 'gray'}>{entry.shared ? 'yes' : 'no'}</Text>
        {'  '}enabled: <Text color={entry.disabled ? 'red' : 'green'}>{entry.disabled ? 'no' : 'yes'}</Text>
      </Text>
      <Text color="gray">{'┈'.repeat(process.stdout.columns || 80)}</Text>
    </Box>
  );
}
