import type { ContextEntry, DecayPolicy, GCResult } from './types.js';

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a DecayPolicy with the given strategy and optional overrides.
 */
export function createDecayPolicy(
  strategy: DecayPolicy['strategy'],
  options?: Partial<Omit<DecayPolicy, 'strategy'>>,
): DecayPolicy {
  return { strategy, ...options };
}

// ─── Decay Engine ─────────────────────────────────────────────────────────────

const ABANDONED_PENALTY = 0.5;

export class DecayEngine {
  /**
   * Compute a relevance score in [0, 1] for the given entry.
   *
   * @param entry        - The context entry to score.
   * @param frameIndex   - Index of the current frame (used for 'step' strategy).
   * @param isAbandoned  - Whether the entry's frame has been abandoned.
   */
  score(entry: ContextEntry, frameIndex: number, isAbandoned = false): number {
    const raw = this._baseScore(entry, frameIndex);
    const boosted = this._applyAccessBoost(raw, entry);
    return isAbandoned ? boosted * ABANDONED_PENALTY : boosted;
  }

  private _baseScore(entry: ContextEntry, frameIndex: number): number {
    const { strategy, halfLife, retainUntil, customScorer } = entry.decayPolicy;
    const age = Date.now() - entry.createdAt;

    switch (strategy) {
      case 'none':
        return 1.0;

      case 'linear': {
        const hl = halfLife ?? 60000;
        return Math.pow(0.5, age / hl);
      }

      case 'step': {
        if (retainUntil === undefined) return 1.0;
        const threshold = typeof retainUntil === 'number' ? retainUntil : Number(retainUntil);
        return frameIndex <= threshold ? 1.0 : 0.0;
      }

      case 'custom': {
        if (!customScorer) return 1.0;
        const accessCount = entry.accessLog?.accessCount ?? 0;
        return Math.max(0, Math.min(1, customScorer(age, accessCount)));
      }

      default:
        return 1.0;
    }
  }

  private _applyAccessBoost(baseScore: number, entry: ContextEntry): number {
    if (!entry.accessLog) return baseScore;

    const { lastAccessed, accessCount } = entry.accessLog;

    // Frequency boost: log-scaled so each additional access adds diminishing value.
    const frequencyBoost = Math.log2(1 + accessCount) * 0.05;

    // Recency boost: entries accessed within the last 5 seconds get a small bump.
    const recencyMs = Date.now() - lastAccessed;
    const recencyBoost = recencyMs < 5000 ? 0.1 : recencyMs < 30000 ? 0.05 : 0;

    return Math.min(1.0, baseScore + frequencyBoost + recencyBoost);
  }
}

// ─── Garbage Collector ────────────────────────────────────────────────────────

const RETAIN_THRESHOLD = 0.4;
const COMPACT_THRESHOLD = 0.1;

export class GarbageCollector {
  constructor(private readonly engine: DecayEngine) {}

  /**
   * Classify entries into retained, compacted, or collected buckets.
   *
   * @param entries        - All context entries to evaluate.
   * @param frameStatusMap - Map of frameId → frame status; entries whose frame
   *                         is 'abandoned' receive the abandoned penalty.
   */
  classify(
    entries: ContextEntry[],
    frameStatusMap: Map<string, 'active' | 'completed' | 'abandoned'>,
  ): GCResult {
    const retained: ContextEntry[] = [];
    const compacted: ContextEntry[] = [];
    const collected: ContextEntry[] = [];

    // Use the middle of the current frame set as a rough frameIndex proxy (0 is fine).
    for (const entry of entries) {
      const isAbandoned = frameStatusMap.get(entry.frameId) === 'abandoned';
      const s = this.engine.score(entry, 0, isAbandoned);

      if (s >= RETAIN_THRESHOLD) {
        retained.push(entry);
      } else if (s >= COMPACT_THRESHOLD) {
        compacted.push(entry);
      } else {
        collected.push(entry);
      }
    }

    return { retained, compacted, collected };
  }
}
