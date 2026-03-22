import type { BoundaryDetector, ContextEntry } from '../core/types.js';

export type { BoundaryDetector };

export function hasUserInput(entries: ContextEntry[]): boolean {
  return entries.some(e => e.metadata.eventType === 'user-message');
}
