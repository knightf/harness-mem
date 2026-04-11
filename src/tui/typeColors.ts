import type { IndexEntryType } from '../storage/digest-store.js';

export const TYPE_COLORS: Record<IndexEntryType, string> = {
  elimination: 'red',
  decision: 'blue',
  invariant: 'green',
  preference: 'yellow',
  todo: 'magenta',
  question: 'cyan',
};
