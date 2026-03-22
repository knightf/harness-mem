import type { Artifact, ArtifactSnapshot } from '../core/types.js';
import { normalizePath } from '../core/utils.js';

export class SideEffectStoreImpl {
  private artifacts = new Map<string, Artifact>();
  private cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  record(artifact: Artifact): void {
    const key = normalizePath(artifact.location, this.cwd);
    this.artifacts.set(key, { ...artifact, location: key });
  }

  get(location: string): Artifact | null {
    const key = normalizePath(location, this.cwd);
    return this.artifacts.get(key) ?? null;
  }

  update(location: string, newState: unknown, frameId: string, timestamp: number): void {
    const key = normalizePath(location, this.cwd);
    const existing = this.artifacts.get(key);
    if (!existing) return;

    const snapshot: ArtifactSnapshot = {
      frameId,
      timestamp,
      state: existing.currentState,
    };
    existing.snapshots.push(snapshot);
    existing.currentState = newState;
  }

  all(): Artifact[] {
    return Array.from(this.artifacts.values());
  }
}
