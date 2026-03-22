import { describe, it, expect } from 'vitest';
import { TraceReplayIterator } from '../../src/trace/replay.js';
import { ToolClusterDetector } from '../../src/boundary/tool-cluster.js';
import path from 'node:path';
import fs from 'node:fs';

const realTracePath = path.resolve('test/fixtures/traces/real-session.jsonl');

describe('Integration: Real Trace Replay', () => {
  it('should replay a real Claude Code session without errors', async () => {
    if (!fs.existsSync(realTracePath)) {
      console.log('Skipping: no real session trace found.');
      return;
    }

    const detector = new ToolClusterDetector();
    const iterator = new TraceReplayIterator(
      'C:/Users/Eric/Repos/harness',
      detector
    );
    await iterator.load(realTracePath);
    expect(iterator.eventCount()).toBeGreaterThan(0);

    const result = await iterator.runAll(50000);

    // Basic sanity checks
    expect(result.frames.length).toBeGreaterThan(0);
    expect(result.resolutions.length).toBeGreaterThan(0);

    // Log summary for manual inspection
    console.log('--- Replay Summary ---');
    console.log(`Events: ${iterator.eventCount()}`);
    console.log(`Frames: ${result.frames.length}`);
    console.log(`Resolution snapshots: ${result.resolutions.length}`);
    console.log(`Timeline entries: ${result.timeline.length}`);

    for (const entry of result.timeline) {
      console.log(`  Frame ${entry.frameId}: ${entry.boundary.type} (${entry.boundary.description}) — ${entry.entriesAdded} entries, ${entry.tokensUsed} tokens`);
    }
  }, 60000); // 60s timeout for large traces
});
