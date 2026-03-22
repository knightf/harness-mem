import type { ContextEntry, AccessLog, GCResult } from '../core/types.js';
import type { DecayEngineImpl } from './decay-engine.js';
import type { TokenEstimator } from '../core/types.js';

export class GarbageCollector {
  private retainThreshold = 0.4;
  private collectThreshold = 0.1;

  constructor(
    private decayEngine: DecayEngineImpl,
    private tokenEstimator: TokenEstimator
  ) {}

  classify(entries: ContextEntry[], now: number, accessLog: AccessLog): GCResult {
    const retained: ContextEntry[] = [];
    const compacted: ContextEntry[] = [];
    const collected: ContextEntry[] = [];

    for (const entry of entries) {
      const score = this.decayEngine.score(entry, now, accessLog);
      if (score >= this.retainThreshold) {
        retained.push(entry);
      } else if (score >= this.collectThreshold) {
        compacted.push(entry);
      } else {
        collected.push(entry);
      }
    }

    return { retained, compacted, collected };
  }
}
