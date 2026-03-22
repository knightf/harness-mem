import type { Compactor, ContextEntry, LLMProvider } from '../core/types.js';
import { generateId } from '../core/utils.js';
import { createDecayPolicy } from './policies.js';

export class LLMCompactor implements Compactor {
  constructor(private llm: LLMProvider) {}

  async compact(entries: ContextEntry[]): Promise<ContextEntry> {
    const summaryPrompt = `Summarize the following context entries into a single concise paragraph that preserves the essential information:\n\n${entries.map(e => `- ${JSON.stringify(e.content)}`).join('\n')}`;
    const summary = await this.llm.complete(summaryPrompt, { maxTokens: 200 });
    const maxCreatedAt = Math.max(...entries.map(e => e.createdAt));

    return {
      id: generateId(),
      type: entries[0].type,
      content: summary,
      createdAt: maxCreatedAt,
      decay: createDecayPolicy('linear', { halfLife: 5000 }),
      references: entries.flatMap(e => e.references),
      metadata: { compactedFrom: entries.map(e => e.id) },
    };
  }
}
