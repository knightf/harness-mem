import { describe, it, expect } from 'vitest';
import { TraceAdapter } from '../../src/trace/adapter.js';
import path from 'node:path';

const fixturePath = path.resolve('test/fixtures/traces/sample.jsonl');

describe('TraceAdapter', () => {
  it('should parse JSONL into RawTraceEntries', async () => {
    const adapter = new TraceAdapter('/project');
    const raw = await adapter.parseRaw(fixturePath);
    expect(raw).toHaveLength(5);
    expect(raw[0].type).toBe('user');
  });

  it('should decompose raw entries into TraceEvents', async () => {
    const adapter = new TraceAdapter('/project');
    const events = await adapter.decompose(fixturePath);
    expect(events.length).toBeGreaterThanOrEqual(7);
  });

  it('should decompose assistant messages into multiple events', async () => {
    const adapter = new TraceAdapter('/project');
    const events = await adapter.decompose(fixturePath);
    const textEvents = events.filter(e => e.type === 'assistant-text');
    const toolCallEvents = events.filter(e => e.type === 'tool-call');
    expect(textEvents.length).toBeGreaterThanOrEqual(2);
    expect(toolCallEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('should detect side effects on Edit tool calls', async () => {
    const adapter = new TraceAdapter('/project');
    const events = await adapter.decompose(fixturePath);
    const editCall = events.find(e => e.type === 'tool-call' && e.toolName === 'Edit');
    expect(editCall).toBeDefined();
    expect(editCall!.hasSideEffect).toBe(true);
    expect(editCall!.sideEffectPaths!.length).toBeGreaterThan(0);
    expect(editCall!.sideEffectPaths![0]).toContain('index.ts');
  });

  it('should not mark Read as side effect', async () => {
    const adapter = new TraceAdapter('/project');
    const events = await adapter.decompose(fixturePath);
    const readCall = events.find(e => e.type === 'tool-call' && e.toolName === 'Read');
    expect(readCall).toBeDefined();
    expect(readCall!.hasSideEffect).toBeFalsy();
  });

  it('should preserve sourceUuid linking back to raw entry', async () => {
    const adapter = new TraceAdapter('/project');
    const events = await adapter.decompose(fixturePath);
    expect(events.every(e => typeof e.sourceUuid === 'string')).toBe(true);
  });
});
