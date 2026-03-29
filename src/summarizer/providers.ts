export type ProviderKey = 'anthropic' | 'openai' | 'google' | 'moonshotai';

export interface ProviderDefinition {
  name: string;
  defaultModel: string;
  envKey: string;
  load: () => Promise<(modelId: string) => unknown>;
}

export const PROVIDER_REGISTRY: Record<ProviderKey, ProviderDefinition> = {
  anthropic: {
    name: 'Anthropic',
    defaultModel: 'claude-haiku-4-5-20251001',
    envKey: 'ANTHROPIC_API_KEY',
    load: async () => (await import('@ai-sdk/anthropic')).anthropic,
  },
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    envKey: 'OPENAI_API_KEY',
    load: async () => (await import('@ai-sdk/openai')).openai,
  },
  google: {
    name: 'Google',
    defaultModel: 'gemini-2.5-flash',
    envKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    load: async () => (await import('@ai-sdk/google')).google,
  },
  moonshotai: {
    name: 'Moonshot AI',
    defaultModel: 'kimi-k2.5',
    envKey: 'MOONSHOT_API_KEY',
    load: async () => (await import('@ai-sdk/moonshotai')).moonshotai,
  },
};
