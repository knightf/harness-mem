import React from 'react';
import { Box, Text } from 'ink';
import type { IndexEntry } from '../storage/digest-store.js';
import { TYPE_COLORS } from './typeColors.js';

// ─── ConstraintRow ───────────────────────────────────────────────────────────

interface ConstraintRowProps {
  entry: IndexEntry;
  isFocused: boolean;
  score?: number;
}

export function ConstraintRow({ entry, isFocused, score }: ConstraintRowProps): React.ReactElement {
  const toggleChar = entry.disabled ? ' ' : '✓';
  const color = TYPE_COLORS[entry.type] ?? 'white';
  const maxContentLen = (process.stdout.columns || 80) - 30;
  const truncated = entry.content.length > maxContentLen
    ? entry.content.slice(0, maxContentLen - 1) + '…'
    : entry.content;

  return (
    <Box>
      <Text inverse={isFocused}>
        <Text color={entry.disabled ? 'gray' : 'white'}>[{toggleChar}] </Text>
        <Text color={color} bold>{entry.type.padEnd(11)} </Text>
        <Text color={entry.disabled ? 'gray' : 'white'}>{truncated}</Text>
        {score !== undefined && <Text color="yellowBright"> ({score})</Text>}
      </Text>
    </Box>
  );
}
