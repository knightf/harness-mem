import { generateText } from 'ai';
import { PROVIDER_REGISTRY } from './providers.js';
import type { ProviderDefinition } from './providers.js';
import type { ProviderKey, ResolvedContext, SessionConstraints } from '../engine/types.js';

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

  async summarize(resolved: ResolvedContext): Promise<SessionConstraints> {
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
      'You are analyzing an AI agent session to extract reusable constraints for future sessions.',
      'A constraint is anything that helps a future AI agent avoid wrong paths or converge on correct solutions faster.',
      '',
      'Respond with ONLY valid JSON matching this schema (no markdown fencing, no extra text):',
      '',
      '{',
      '  "summary": "One to two sentences on what this session accomplished.",',
      '  "keywords": ["3-5 lowercase terms for retrieval: domain concepts, file names, tech names, problem types"],',
      '  "eliminations": [{ "dont": "what to avoid", "because": "why" }],',
      '  "decisions": [{ "chose": "what was chosen", "over": ["rejected alternatives"], "because": "why" }],',
      '  "invariants": [{ "always": "what holds true", "scope": "where this applies" }],',
      '  "preferences": [{ "prefer": "preferred approach", "over": "alternative", "context": "when this applies" }],',
      '  "openThreads": [{ "type": "todo|question", "what": "description", "context": "why it matters" }]',
      '}',
      '',
      'Rules:',
      '- "keywords": 3-5 lowercase retrieval terms — domain concepts (auth, database), file/module names (middleware, jwt), technologies (redis, vitest), problem types (migration, performance). These are used to match constraints to future tasks, so pick terms a developer would naturally use when working in this area.',
      '- Omit empty arrays — only include constraint types that have entries.',
      '- Use file references like `path/to/file.ts:line` where relevant.',
      '- Focus on what would help a FUTURE session, not just documenting what happened.',
      '- Eliminations: things tried and failed, or explicitly rejected.',
      '- Decisions: choices made between alternatives, with rationale.',
      '- Invariants: facts about the codebase/project established or confirmed.',
      '- Preferences: user preferences about style, workflow, or approach.',
      '- Open threads: unfinished work or unresolved questions.',
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

    return parseConstraintsResponse(result.text);
  }
}

/**
 * Parses LLM response text into SessionConstraints.
 * Handles markdown-fenced JSON and falls back gracefully on malformed output.
 */
export function parseConstraintsResponse(text: string): SessionConstraints {
  let jsonText = text.trim();

  // Strip markdown code fences if present
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const parsed = JSON.parse(jsonText);
    return {
      summary: parsed.summary ?? '',
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      eliminations: Array.isArray(parsed.eliminations) ? parsed.eliminations : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      invariants: Array.isArray(parsed.invariants) ? parsed.invariants : [],
      preferences: Array.isArray(parsed.preferences) ? parsed.preferences : [],
      openThreads: Array.isArray(parsed.openThreads) ? parsed.openThreads : [],
    };
  } catch {
    // Fallback: stuff raw text into summary so the digest pipeline doesn't break
    return {
      summary: text,
      keywords: [],
      eliminations: [],
      decisions: [],
      invariants: [],
      preferences: [],
      openThreads: [],
    };
  }
}
