import { generateText } from 'ai';
import { PROVIDER_REGISTRY } from './providers.js';
import type { ProviderDefinition } from './providers.js';
import type { ProviderKey, ResolvedContext } from '../engine/types.js';

export class Summarizer {
  private model: string;
  private provider: ProviderKey;
  private definition: ProviderDefinition;

  constructor({ model, provider }: { model?: string; provider: ProviderKey }) {
    const definition = PROVIDER_REGISTRY[provider];
    if (!definition) {
      throw new Error(
        `Unknown provider '${provider}'. Supported providers: ${Object.keys(PROVIDER_REGISTRY).join(', ')}`
      );
    }
    this.definition = definition;
    this.provider = provider;
    this.model = model || definition.defaultModel;
  }

  async summarize(resolved: ResolvedContext): Promise<string> {
    if (this.definition.envKey && !process.env[this.definition.envKey]) {
      throw new Error(
        `Provider '${this.provider}' requires ${this.definition.envKey} to be set. ` +
        `Add it to your environment or ~/.harness-mem/.env`
      );
    }

    let factory: (modelId: string) => unknown;
    try {
      factory = await this.definition.load();
    } catch {
      throw new Error(
        `Provider '${this.provider}' failed to load. Ensure @ai-sdk/${this.provider} is installed.`
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
