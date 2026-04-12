import React from 'react';
import { Box, Text } from 'ink';
import { ConstraintRow } from './ConstraintRow.js';
import type { ScoredEntry } from './useConstraints.js';

// ─── ConstraintList ──────────────────────────────────────────────────────────

const VIEWPORT_SIZE = 15;

interface ConstraintListProps {
  items: ScoredEntry[];
  cursor: number;
  isDeleted?: (originalIndex: number) => boolean;
}

export function ConstraintList({ items, cursor, isDeleted }: ConstraintListProps): React.ReactElement {
  if (items.length === 0) {
    return (
      <Box paddingLeft={1}>
        <Text color="gray">No constraints found.</Text>
      </Box>
    );
  }

  // Calculate viewport window
  const half = Math.floor(VIEWPORT_SIZE / 2);
  let start = Math.max(0, cursor - half);
  const end = Math.min(items.length, start + VIEWPORT_SIZE);
  if (end - start < VIEWPORT_SIZE) {
    start = Math.max(0, end - VIEWPORT_SIZE);
  }

  const visible = items.slice(start, end);

  return (
    <Box flexDirection="column">
      {start > 0 && (
        <Box paddingLeft={1}>
          <Text color="gray">↑ {start} more above</Text>
        </Box>
      )}
      {visible.map((item, i) => (
        <ConstraintRow
          key={`${item.entry.sessionId}-${item.entry.type}-${item.index}`}
          entry={item.entry}
          isFocused={start + i === cursor}
          score={item.score}
          deleted={isDeleted ? isDeleted(item.index) : false}
        />
      ))}
      {end < items.length && (
        <Box paddingLeft={1}>
          <Text color="gray">↓ {items.length - end} more below</Text>
        </Box>
      )}
    </Box>
  );
}
