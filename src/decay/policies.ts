import type { DecayPolicy } from '../core/types.js';

export function createDecayPolicy(
  strategy: DecayPolicy['strategy'],
  options: {
    halfLife?: number;
    retainUntil?: string;
    customScorer?: (age: number, accessCount: number) => number;
  } = {}
): DecayPolicy {
  return {
    strategy,
    halfLife: options.halfLife,
    retainUntil: options.retainUntil,
    customScorer: options.customScorer,
  };
}
