import type { BoundaryDetector, BoundarySignal, ContextFrame, ContextEntry } from '../core/types.js';

interface ToolClusterConfig {
  timeGapMs?: number;
}

export class ToolClusterDetector implements BoundaryDetector {
  private timeGapMs: number;

  constructor(config: ToolClusterConfig = {}) {
    this.timeGapMs = config.timeGapMs ?? 10000;
  }

  async analyze(currentFrame: ContextFrame, newActivity: ContextEntry[]): Promise<BoundarySignal | null> {
    const newToolEntries = newActivity.filter(e => e.metadata.toolName);
    if (newToolEntries.length === 0) return null;

    const lastFrameToolEntries = currentFrame.entries.filter(e => e.metadata.toolName);
    if (lastFrameToolEntries.length === 0) return null;

    const lastTool = lastFrameToolEntries[lastFrameToolEntries.length - 1];
    const newTool = newToolEntries[0];

    if (lastTool.metadata.toolName !== newTool.metadata.toolName) {
      return {
        type: 'tool-cluster',
        description: `Tool changed from ${lastTool.metadata.toolName} to ${newTool.metadata.toolName}`,
        confidence: 0.8,
      };
    }

    if (newTool.createdAt - lastTool.createdAt > this.timeGapMs) {
      return {
        type: 'tool-cluster',
        description: `Time gap of ${newTool.createdAt - lastTool.createdAt}ms between ${lastTool.metadata.toolName} calls`,
        confidence: 0.6,
      };
    }

    return null;
  }
}
