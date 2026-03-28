import { readFile } from 'fs/promises';
import { generateId, estimateTokens } from '../engine/utils.js';
import { detectSideEffect } from '../engine/side-effects.js';
import type { RawTraceEntry, TraceEvent, ContentBlock } from '../engine/types.js';

// ─── Session Metadata ─────────────────────────────────────────────────────────

export interface SessionMetadata {
  sessionId: string | undefined;
  startTime: string | undefined;
  endTime: string | undefined;
  cwd: string | undefined;
}

// ─── TraceParser ──────────────────────────────────────────────────────────────

export class TraceParser {
  /**
   * Read a JSONL file and parse each non-empty line as a RawTraceEntry.
   */
  async parseRaw(filePath: string): Promise<RawTraceEntry[]> {
    const contents = await readFile(filePath, 'utf-8');
    return contents
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => JSON.parse(line) as RawTraceEntry);
  }

  /**
   * Convert raw trace entries into structured TraceEvents.
   *
   * - 'progress' entries are skipped entirely.
   * - 'user' entries with text content produce 'user-message' events.
   * - 'user' entries with tool_result content produce 'tool-result' events.
   * - 'assistant' entries produce 'assistant-text' and/or 'tool-call' events
   *   for each content block.
   */
  decompose(rawEntries: RawTraceEntry[]): TraceEvent[] {
    const events: TraceEvent[] = [];

    for (const entry of rawEntries) {
      if (entry.type === 'progress') {
        continue;
      }

      const timestamp = new Date(entry.timestamp).getTime();

      if (entry.type === 'user') {
        const content = entry.message?.content;

        if (!content) {
          continue;
        }

        // String content → single user-message
        if (typeof content === 'string') {
          events.push({
            id: generateId(),
            type: 'user-message',
            content,
            timestamp,
            tokenEstimate: estimateTokens(content),
          });
          continue;
        }

        // Array content: split into user-message vs tool-result events
        const textBlocks = content.filter(b => b.type === 'text');
        const toolResultBlocks = content.filter(b => b.type === 'tool_result');

        if (textBlocks.length > 0) {
          const textContent = textBlocks
            .map(b => b.text ?? '')
            .join('\n');
          events.push({
            id: generateId(),
            type: 'user-message',
            content: textContent,
            timestamp,
            tokenEstimate: estimateTokens(textContent),
          });
        }

        for (const block of toolResultBlocks) {
          events.push({
            id: generateId(),
            type: 'tool-result',
            content: block.content,
            timestamp,
            tokenEstimate: estimateTokens(block.content),
            metadata: {
              toolUseId: (block as ContentBlock & { tool_use_id?: string }).tool_use_id,
            },
          });
        }

        continue;
      }

      if (entry.type === 'assistant') {
        const content = entry.message?.content;

        if (!content) {
          continue;
        }

        if (typeof content === 'string') {
          events.push({
            id: generateId(),
            type: 'assistant-text',
            content,
            timestamp,
            tokenEstimate: estimateTokens(content),
          });
          continue;
        }

        for (const block of content) {
          if (block.type === 'text') {
            events.push({
              id: generateId(),
              type: 'assistant-text',
              content: block.text ?? '',
              timestamp,
              tokenEstimate: estimateTokens(block.text ?? ''),
            });
          } else if (block.type === 'tool_use') {
            const toolName = block.name ?? '';
            const toolInput = (block.input ?? {}) as Record<string, unknown>;
            const sideEffect = detectSideEffect(toolName, toolInput);
            events.push({
              id: generateId(),
              type: 'tool-call',
              content: toolInput,
              timestamp,
              tokenEstimate: estimateTokens(toolInput),
              metadata: { toolName },
              sideEffect,
            });
          }
        }
      }
    }

    return events;
  }

  /**
   * Extract high-level session metadata from a set of raw entries.
   * sessionId, startTime, and endTime are derived from first/last entries.
   * cwd is taken from the first entry that carries it.
   */
  extractMetadata(rawEntries: RawTraceEntry[]): SessionMetadata {
    if (rawEntries.length === 0) {
      return { sessionId: undefined, startTime: undefined, endTime: undefined, cwd: undefined };
    }

    const first = rawEntries[0];
    const last = rawEntries[rawEntries.length - 1];
    const cwdEntry = rawEntries.find(e => e.cwd !== undefined);

    return {
      sessionId: first.sessionId,
      startTime: first.timestamp,
      endTime: last.timestamp,
      cwd: cwdEntry?.cwd,
    };
  }
}
