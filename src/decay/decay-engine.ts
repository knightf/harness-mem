import type { ContextEntry, AccessLog } from '../core/types.js';

export class DecayEngineImpl {
  score(entry: ContextEntry, now: number, accessLog: AccessLog): number {
    const age = now - entry.createdAt;
    const accessCount = accessLog.accessCount.get(entry.id) ?? 0;
    const { decay } = entry;

    let baseScore: number;

    switch (decay.strategy) {
      case 'none':
        baseScore = 1.0;
        break;
      case 'linear': {
        const halfLife = decay.halfLife ?? 1000;
        // Exponential half-life decay (named 'linear' in spec but uses standard half-life model)
        baseScore = Math.pow(0.5, age / halfLife);
        break;
      }
      case 'step':
        baseScore = age < (decay.halfLife ?? Infinity) ? 1.0 : 0.0;
        break;
      case 'custom':
        baseScore = decay.customScorer ? decay.customScorer(age, accessCount) : 1.0;
        break;
      default:
        baseScore = 1.0;
    }

    // Access boost: recent and frequent access increases score
    if (accessCount > 0 && decay.strategy !== 'custom') {
      const lastAccessed = accessLog.lastAccessed.get(entry.id) ?? entry.createdAt;
      const recency = Math.pow(0.5, (now - lastAccessed) / (decay.halfLife ?? 1000));
      const frequencyBoost = Math.min(accessCount * 0.05, 0.3);
      baseScore = Math.min(1.0, baseScore + recency * frequencyBoost);
    }

    // Accelerated decay for abandoned frame entries
    if (entry.metadata.frameStatus === 'abandoned') {
      baseScore *= 0.5;
    }

    return Math.max(0, Math.min(1, baseScore));
  }
}
