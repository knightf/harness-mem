import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

// ─── SearchInput ─────────────────────────────────────────────────────────────

interface SearchInputProps {
  mode: 'search' | 'simulation';
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

export function SearchInput({ mode, value, onChange, onSubmit }: SearchInputProps): React.ReactElement {
  const label = mode === 'search' ? 'Search' : 'Simulation';

  return (
    <Box>
      <Text color="cyan" bold>{label}: </Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder={mode === 'search' ? 'type keywords...' : 'type a prompt to simulate recall...'}
      />
    </Box>
  );
}
