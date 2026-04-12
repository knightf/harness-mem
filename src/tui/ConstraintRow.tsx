import React from 'react';
import path from 'node:path';
import { Box, Text } from 'ink';
import type { IndexEntry } from '../storage/digest-store.js';
import { TYPE_COLORS } from './typeColors.js';

// ─── ConstraintRow ───────────────────────────────────────────────────────────

interface ConstraintRowProps {
  entry: IndexEntry;
  isFocused: boolean;
  score?: number;
  deleted?: boolean;
}

const PROJECT_COL_WIDTH = 14;

function projectLabel(workingDirectory: string | undefined): string {
  if (!workingDirectory) return '—';
  const base = path.basename(workingDirectory);
  if (!base) return '—';
  if (base.length <= PROJECT_COL_WIDTH) return base;
  return base.slice(0, PROJECT_COL_WIDTH - 1) + '…';
}

export function ConstraintRow({ entry, isFocused, score, deleted = false }: ConstraintRowProps): React.ReactElement {
  const toggleChar = entry.disabled ? ' ' : '✓';
  const sharedChar = entry.shared ? 'G' : ' ';
  const color = TYPE_COLORS[entry.type] ?? 'white';
  const project = projectLabel(entry.workingDirectory).padEnd(PROJECT_COL_WIDTH);
  // Fixed column widths: [✓](3) [G](3) type+space(12) project+space(15) — 33 chars before content
  const maxContentLen = (process.stdout.columns || 80) - 36;
  const truncated = entry.content.length > maxContentLen
    ? entry.content.slice(0, maxContentLen - 1) + '…'
    : entry.content;

  return (
    <Box>
      <Text inverse={isFocused}>
        <Text color={entry.disabled ? 'gray' : 'white'}>[{toggleChar}] </Text>
        <Text color={entry.shared ? 'cyanBright' : 'gray'} bold>[{sharedChar}] </Text>
        <Text color={color} bold>{entry.type.padEnd(11)} </Text>
        <Text color="magenta" dimColor>{project}</Text>
        <Text color={entry.disabled ? 'gray' : 'white'} strikethrough={deleted}>{truncated}</Text>
        {deleted && <Text color="red" bold> DELETED</Text>}
        {score !== undefined && <Text color="yellowBright"> ({score})</Text>}
      </Text>
    </Box>
  );
}
