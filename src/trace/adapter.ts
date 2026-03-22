import fs from 'node:fs/promises';
import type { RawTraceEntry, TraceEvent, ContentBlock } from '../core/types.js';
import { detectSideEffect } from './side-effect-detector.js';

export class TraceAdapter {
  constructor(private cwd: string) {}

  async parseRaw(jsonlPath: string): Promise<RawTraceEntry[]> {
    const content = await fs.readFile(jsonlPath, 'utf-8');
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line) as RawTraceEntry);
  }

  async decompose(jsonlPath: string): Promise<TraceEvent[]> {
    const raw = await this.parseRaw(jsonlPath);
    const events: TraceEvent[] = [];

    for (const entry of raw) {
      const timestamp = new Date(entry.timestamp).getTime();

      switch (entry.type) {
        case 'user': {
          const content = entry.message?.content;
          if (typeof content === 'string') {
            events.push({
              type: 'user-message',
              timestamp,
              content,
              sourceUuid: entry.uuid,
            });
          }
          break;
        }

        case 'assistant': {
          const content = entry.message?.content;
          if (Array.isArray(content)) {
            for (const block of content as ContentBlock[]) {
              if (block.type === 'text' && block.text) {
                events.push({
                  type: 'assistant-text',
                  timestamp,
                  content: block.text,
                  sourceUuid: entry.uuid,
                });
              } else if (block.type === 'tool_use' && block.name) {
                const sideEffect = detectSideEffect(block.name, block.input, this.cwd);
                events.push({
                  type: 'tool-call',
                  timestamp,
                  content: null,
                  toolName: block.name,
                  toolParams: block.input,
                  sourceUuid: entry.uuid,
                  hasSideEffect: sideEffect.hasSideEffect,
                  sideEffectPaths: sideEffect.paths.length > 0 ? sideEffect.paths : undefined,
                });
              }
            }
          }
          break;
        }

        case 'tool_result': {
          const content = entry.message?.content;
          events.push({
            type: 'tool-result',
            timestamp,
            content: null,
            toolResult: Array.isArray(content) ? (content as ContentBlock[])[0]?.content : content,
            sourceUuid: entry.uuid,
          });
          break;
        }

        case 'progress': {
          // Skip progress entries for now
          break;
        }
      }
    }

    return events;
  }
}
