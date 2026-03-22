import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider } from '../core/types.js';

export class ClaudeLLMProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = 'claude-haiku-4-5-20251001') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature ?? 0,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock ? textBlock.text : '';
  }
}
