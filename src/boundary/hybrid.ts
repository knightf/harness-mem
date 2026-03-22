import type { BoundaryDetector, BoundarySignal, ContextFrame, ContextEntry } from '../core/types.js';
import { hasUserInput } from './detector.js';

export class HybridBoundaryDetector implements BoundaryDetector {
  constructor(
    private heuristic: BoundaryDetector,
    private semantic: BoundaryDetector
  ) {}

  async analyze(currentFrame: ContextFrame, newActivity: ContextEntry[]): Promise<BoundarySignal | null> {
    const heuristicResult = await this.heuristic.analyze(currentFrame, newActivity);
    const needsSemantic = hasUserInput(newActivity) || heuristicResult !== null;

    if (!needsSemantic) {
      return heuristicResult;
    }

    let semanticResult: BoundarySignal | null = null;
    try {
      semanticResult = await this.semantic.analyze(currentFrame, newActivity);
    } catch {
      // Graceful degradation: fall back to heuristic
      return heuristicResult;
    }

    return this.merge(heuristicResult, semanticResult);
  }

  private merge(
    heuristic: BoundarySignal | null,
    semantic: BoundarySignal | null
  ): BoundarySignal | null {
    // If only one fired, return it
    if (!heuristic && !semantic) return null;
    if (!heuristic) return semantic;
    if (!semantic) return heuristic;

    // Type-specific precedence:
    // Heuristic owns tool-cluster
    if (heuristic.type === 'tool-cluster') return heuristic;
    // Semantic owns user-input and goal-shift
    if (semantic.type === 'user-input' || semantic.type === 'goal-shift') return semantic;

    // Confidence tiebreak
    return heuristic.confidence >= semantic.confidence ? heuristic : semantic;
  }
}
