import type { ContextEntry, BoundarySignal } from './types.js';

export interface ToolClusterDetectorOptions {
  timeGapMs?: number;
}

export class ToolClusterDetector {
  private readonly timeGapMs: number;

  constructor({ timeGapMs = 10000 }: ToolClusterDetectorOptions = {}) {
    this.timeGapMs = timeGapMs;
  }

  async detect(current: ContextEntry, history: ContextEntry[]): Promise<BoundarySignal | null> {
    const currentTool = current.metadata.toolName;
    if (!currentTool) return null;

    // Find the last tool entry in history (searching from the end)
    const lastToolEntry = [...history].reverse().find(e => e.metadata.toolName != null);

    if (!lastToolEntry) return null;

    // Check tool name change
    if (lastToolEntry.metadata.toolName !== currentTool) {
      return { type: 'tool-cluster', confidence: 0.8 };
    }

    // Check time gap
    const gap = current.createdAt - lastToolEntry.createdAt;
    if (gap > this.timeGapMs) {
      return { type: 'tool-cluster', confidence: 0.6 };
    }

    return null;
  }
}
