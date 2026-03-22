import type { ContextFrame, ContextEntry, Artifact, AccessLog, ResolvedContext, TokenEstimator } from './types.js';
import type { DecayEngineImpl } from '../decay/decay-engine.js';

interface ScoredEntry {
  entry: ContextEntry;
  tier: 1 | 2 | 3;
  decayScore: number;
  effectiveScore: number;
  tokens: number;
}

export class ScopeChain {
  constructor(
    private decayEngine: DecayEngineImpl,
    private tokenEstimator: TokenEstimator
  ) {}

  resolve(
    currentFrame: ContextFrame,
    frames: Map<string, ContextFrame>,
    entryRegistry: Map<string, ContextEntry>,
    crossSessionEntries: ContextEntry[],
    accessLog: AccessLog,
    budget: number
  ): ResolvedContext {
    const now = Date.now();
    const scored: ScoredEntry[] = [];
    const capturedIds = new Set(currentFrame.captures);

    // Tier 1: current frame entries
    for (const entry of currentFrame.entries) {
      const decayScore = this.decayEngine.score(entry, now, accessLog);
      scored.push({
        entry,
        tier: 1,
        decayScore,
        effectiveScore: decayScore + 2.0, // Tier 1 boost
        tokens: this.tokenEstimator.estimate(entry.content),
      });
    }

    // Walk parent chain
    let parentId = currentFrame.parentId;
    while (parentId) {
      const parentFrame = frames.get(parentId);
      if (!parentFrame) break;

      for (const entry of parentFrame.entries) {
        const decayScore = this.decayEngine.score(entry, now, accessLog);
        const isCaptured = capturedIds.has(entry.id);
        scored.push({
          entry,
          tier: isCaptured ? 2 : 3,
          decayScore,
          effectiveScore: decayScore + (isCaptured ? 1.0 : 0), // Tier 2 boost for captured
          tokens: this.tokenEstimator.estimate(entry.content),
        });
      }

      parentId = parentFrame.parentId;
    }

    // Tier 3: cross-session entries
    for (const entry of crossSessionEntries) {
      const decayScore = this.decayEngine.score(entry, now, accessLog);
      scored.push({
        entry,
        tier: 3,
        decayScore,
        effectiveScore: decayScore,
        tokens: this.tokenEstimator.estimate(entry.content),
      });
    }

    // Sort by effective score descending
    scored.sort((a, b) => b.effectiveScore - a.effectiveScore);

    // Fit within budget
    const included: ContextEntry[] = [];
    const dropped: ContextEntry[] = [];
    let totalTokens = 0;

    for (const s of scored) {
      if (totalTokens + s.tokens <= budget) {
        included.push(s.entry);
        totalTokens += s.tokens;
      } else {
        dropped.push(s.entry);
      }
    }

    return {
      entries: included,
      artifacts: [], // artifacts are added by the engine, not the chain
      totalTokens,
      budget,
      dropped,
    };
  }
}
