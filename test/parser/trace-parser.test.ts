import { describe, it, expect } from 'vitest';
import { TraceParser } from '../../src/parser/trace-parser.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '../fixtures/traces/sample-session.jsonl');

describe('TraceParser', () => {
  it('should parse JSONL file into raw entries', async () => {
    const parser = new TraceParser();
    const raw = await parser.parseRaw(FIXTURE_PATH);
    expect(raw.length).toBeGreaterThan(0);
    expect(raw[0]).toHaveProperty('type');
    expect(raw[0]).toHaveProperty('timestamp');
  });

  it('should decompose raw entries into TraceEvents', async () => {
    const parser = new TraceParser();
    const raw = await parser.parseRaw(FIXTURE_PATH);
    const events = parser.decompose(raw);
    expect(events.length).toBeGreaterThan(0);
    const types = events.map(e => e.type);
    expect(types).toContain('user-message');
    expect(types).toContain('tool-call');
    expect(types).toContain('tool-result');
  });

  it('should detect side effects on tool calls', async () => {
    const parser = new TraceParser();
    const raw = await parser.parseRaw(FIXTURE_PATH);
    const events = parser.decompose(raw);
    const editCall = events.find(e => e.type === 'tool-call' && e.metadata?.toolName === 'Edit');
    expect(editCall).toBeDefined();
    expect(editCall!.sideEffect?.hasSideEffect).toBe(true);
  });

  it('should extract session metadata', async () => {
    const parser = new TraceParser();
    const raw = await parser.parseRaw(FIXTURE_PATH);
    const metadata = parser.extractMetadata(raw);
    expect(metadata.sessionId).toBeDefined();
    expect(metadata.startTime).toBeDefined();
    expect(metadata.endTime).toBeDefined();
  });

  it('should skip progress entries', async () => {
    const parser = new TraceParser();
    const raw = await parser.parseRaw(FIXTURE_PATH);
    const events = parser.decompose(raw);
    const progressEvents = events.filter(e => (e.type as string) === 'progress');
    expect(progressEvents.length).toBe(0);
  });
});
