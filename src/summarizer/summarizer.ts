import { generateText } from 'ai';
import type { ResolvedContext } from '../engine/types.js';

const PROVIDER_REGISTRY: Record<string, () => Promise<any>> = {
  anthropic: async () => (await import('@ai-sdk/anthropic')).anthropic,
  openai: async () => (await import('@ai-sdk/openai')).openai,
  google: async () => (await import('@ai-sdk/google')).google,
};

export class Summarizer {
  private model: string;
  private provider: string;

  constructor({ model, provider }: { model: string; provider: string }) {
    this.model = model;
    this.provider = provider;
  }

  async summarize(resolved: ResolvedContext): Promise<string> {
    let factory: (modelId: string) => unknown;

    const registryEntry = PROVIDER_REGISTRY[this.provider];
    if (!registryEntry) {
      throw new Error(
        `Unknown provider '${this.provider}'. Supported providers: ${Object.keys(PROVIDER_REGISTRY).join(', ')}`
      );
    }

    try {
      factory = await registryEntry();
    } catch {
      throw new Error(
        `Provider '${this.provider}' requires @ai-sdk/${this.provider} — install it with: npm install @ai-sdk/${this.provider}`
      );
    }

    const entriesText = resolved.entries.length > 0
      ? resolved.entries
          .map((e) => {
            const tool = e.metadata?.toolName ? ` [${e.metadata.toolName}]` : '';
            return `- ${String(e.content)}${tool}`;
          })
          .join('\n')
      : '(no conversation entries)';

    const artifactsText = resolved.artifacts.length > 0
      ? resolved.artifacts
          .map((a) => `- ${a.location} (${a.state})`)
          .join('\n')
      : '(no side effects)';

    const prompt = [
      'You are summarizing an AI agent session for a human developer.',
      'Write a handoff note in markdown with these sections:',
      '',
      '## What you worked on',
      '## What changed',
      '## Decisions made',
      '## Still open',
      '',
      'Keep it concise and actionable. Use file references like `path/to/file.ts:line` where relevant.',
      '',
      '--- CONTEXT ENTRIES ---',
      entriesText,
      '',
      '--- SIDE EFFECTS (files/artifacts changed) ---',
      artifactsText,
    ].join('\n');

    const result = await generateText({
      model: factory(this.model) as any,
      prompt,
    });

    return result.text;
  }
}
