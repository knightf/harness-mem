import type { BoundaryDetector, BoundarySignal, ContextFrame, ContextEntry, LLMProvider } from '../core/types.js';

export class SemanticBoundaryDetector implements BoundaryDetector {
  constructor(private llm: LLMProvider) {}

  async analyze(currentFrame: ContextFrame, newActivity: ContextEntry[]): Promise<BoundarySignal | null> {
    const frameSummary = currentFrame.boundary.description;
    const activitySummary = newActivity
      .map(e => {
        if (e.metadata.eventType === 'user-message') return `User: ${String(e.content).slice(0, 200)}`;
        if (e.metadata.toolName) return `Tool: ${e.metadata.toolName}`;
        return `Assistant: ${String(e.content).slice(0, 100)}`;
      })
      .join('\n');

    const prompt = `You are analyzing an AI agent's workflow to detect step boundaries.

Current step purpose: "${frameSummary}"

New activity:
${activitySummary}

Classify this new activity as one of:
- CONTINUATION: The activity continues the current step's purpose
- USER_INPUT: The user has provided new input that starts a new step
- GOAL_SHIFT: The agent's goal has shifted based on what it learned

Respond with exactly one line in the format: CLASSIFICATION confidence
Where confidence is a number between 0 and 1.
Example: GOAL_SHIFT 0.85`;

    const response = await this.llm.complete(prompt, { maxTokens: 50, temperature: 0 });
    return this.parseResponse(response);
  }

  private parseResponse(response: string): BoundarySignal | null {
    const line = response.trim().split('\n')[0];
    const match = line.match(/^(CONTINUATION|USER_INPUT|GOAL_SHIFT)\s+([\d.]+)/);
    if (!match) return null;

    const [, classification, confidenceStr] = match;
    const confidence = parseFloat(confidenceStr);

    if (classification === 'CONTINUATION') return null;

    return {
      type: classification === 'USER_INPUT' ? 'user-input' : 'goal-shift',
      description: `Semantic: ${classification.toLowerCase()}`,
      confidence: isNaN(confidence) ? 0.5 : Math.min(1, Math.max(0, confidence)),
    };
  }
}
