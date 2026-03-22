import { describe, it, expect, vi } from 'vitest';
import { ClaudeLLMProvider } from '../../src/llm/provider.js';

describe('ClaudeLLMProvider', () => {
  it('should implement LLMProvider interface', () => {
    const provider = new ClaudeLLMProvider('test-api-key', 'claude-haiku-4-5-20251001');
    expect(provider).toBeDefined();
    expect(typeof provider.complete).toBe('function');
  });
});
