import { describe, it, expect } from 'vitest';
import { PROVIDER_REGISTRY } from '../../src/summarizer/providers.js';
import type { ProviderDefinition } from '../../src/summarizer/providers.js';
import type { ProviderKey } from '../../src/engine/types.js';

describe('PROVIDER_REGISTRY', () => {
  const expectedProviders: ProviderKey[] = ['anthropic', 'openai', 'google', 'moonshotai'];

  it('should contain all expected providers', () => {
    for (const key of expectedProviders) {
      expect(PROVIDER_REGISTRY).toHaveProperty(key);
    }
  });

  it.each(expectedProviders)('%s should have all required fields', (key) => {
    const def: ProviderDefinition = PROVIDER_REGISTRY[key];
    expect(typeof def.name).toBe('string');
    expect(def.name.length).toBeGreaterThan(0);
    expect(typeof def.defaultModel).toBe('string');
    expect(def.defaultModel.length).toBeGreaterThan(0);
    expect(typeof def.envKey).toBe('string');
    expect(def.envKey.length).toBeGreaterThan(0);
    expect(typeof def.load).toBe('function');
  });

  it('should have correct default models', () => {
    expect(PROVIDER_REGISTRY.anthropic.defaultModel).toBe('claude-haiku-4-5-20251001');
    expect(PROVIDER_REGISTRY.openai.defaultModel).toBe('gpt-4o-mini');
    expect(PROVIDER_REGISTRY.google.defaultModel).toBe('gemini-2.5-flash');
    expect(PROVIDER_REGISTRY.moonshotai.defaultModel).toBe('kimi-k2.5');
  });

  it('should have correct env key names', () => {
    expect(PROVIDER_REGISTRY.anthropic.envKey).toBe('ANTHROPIC_API_KEY');
    expect(PROVIDER_REGISTRY.openai.envKey).toBe('OPENAI_API_KEY');
    expect(PROVIDER_REGISTRY.google.envKey).toBe('GOOGLE_GENERATIVE_AI_API_KEY');
    expect(PROVIDER_REGISTRY.moonshotai.envKey).toBe('MOONSHOT_API_KEY');
  });
});
