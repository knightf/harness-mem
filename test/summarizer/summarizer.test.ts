import { describe, it, expect, vi } from 'vitest';
import { Summarizer } from '../../src/summarizer/summarizer.js';
import type { ResolvedContext } from '../../src/engine/types.js';

vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: `## What you worked on\n\nYou were editing foo.ts to add a new feature.\n\n## What changed\n\n- Modified \`src/foo.ts:42\` — added validation logic\n\n## Decisions made\n\n- Chose runtime validation over compile-time checks\n\n## Still open\n\n- Tests not yet written`,
  }),
}));

describe('Summarizer', () => {
  it('should generate a summary from resolved context', async () => {
    const summarizer = new Summarizer({ model: 'claude-haiku-4-5-20251001', provider: 'anthropic' });
    const resolved: ResolvedContext = {
      entries: [{
        id: 'e1', frameId: 'f1', type: 'conversational',
        content: 'Edit src/foo.ts', tokenEstimate: 10,
        createdAt: Date.now(), decayPolicy: { strategy: 'none' },
        metadata: { toolName: 'Edit' }, references: [],
      }],
      artifacts: [{ id: 'a1', type: 'file', location: 'src/foo.ts', state: 'modified', createdAt: Date.now() }],
      totalTokens: 10, budget: 1000, droppedEntries: 0,
    };
    const summary = await summarizer.summarize(resolved);
    expect(summary).toContain('## What you worked on');
    expect(summary).toContain('## What changed');
  });

  it('should include side effects in the prompt', async () => {
    const { generateText } = await import('ai');
    const summarizer = new Summarizer({ model: 'claude-haiku-4-5-20251001', provider: 'anthropic' });
    const resolved: ResolvedContext = {
      entries: [],
      artifacts: [{ id: 'a1', type: 'file', location: 'src/foo.ts', state: 'created', createdAt: Date.now() }],
      totalTokens: 0, budget: 1000, droppedEntries: 0,
    };
    await summarizer.summarize(resolved);
    expect(generateText).toHaveBeenCalled();
    const call = (generateText as any).mock.calls[0][0];
    expect(call.prompt).toContain('src/foo.ts');
  });
});
