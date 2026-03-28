import { normalizePath } from './utils.js';
import type { Artifact } from './types.js';

// ─── Tool Classification ──────────────────────────────────────────────────────

const NO_SIDE_EFFECT_TOOLS = ['Read', 'Glob', 'Grep'];
const SIDE_EFFECT_TOOLS = ['Edit', 'Write', 'NotebookEdit'];

/**
 * Bash command patterns that indicate a destructive or mutating side effect.
 * Matches: rm, mkdir, mv, cp, chmod, git mutations, output redirects.
 */
const DESTRUCTIVE_BASH_PATTERN =
  /\brm\b|\bmkdir\b|\bmv\b|\bcp\b|\bchmod\b|git\s+(commit|push|merge|rebase|checkout|reset|branch\s+-D)\b|>/;

// ─── detectSideEffect ─────────────────────────────────────────────────────────

export interface SideEffectResult {
  hasSideEffect: boolean;
  paths: string[];
}

/**
 * Determine whether a tool invocation produces a side effect.
 *
 * - NO_SIDE_EFFECT_TOOLS (Read, Glob, Grep): always safe.
 * - SIDE_EFFECT_TOOLS (Edit, Write, NotebookEdit): always mutating; path extracted from input.file_path.
 * - Bash: pattern-matched against known destructive patterns.
 * - Everything else: treated as safe.
 */
export function detectSideEffect(toolName: string, input: Record<string, unknown>): SideEffectResult {
  if (NO_SIDE_EFFECT_TOOLS.includes(toolName)) {
    return { hasSideEffect: false, paths: [] };
  }

  if (SIDE_EFFECT_TOOLS.includes(toolName)) {
    const filePath = typeof input.file_path === 'string' ? input.file_path : undefined;
    return {
      hasSideEffect: true,
      paths: filePath !== undefined ? [filePath] : [],
    };
  }

  if (toolName === 'Bash') {
    const command = typeof input.command === 'string' ? input.command : '';
    const hasSideEffect = DESTRUCTIVE_BASH_PATTERN.test(command);
    return { hasSideEffect, paths: [] };
  }

  return { hasSideEffect: false, paths: [] };
}

// ─── SideEffectStore ──────────────────────────────────────────────────────────

/**
 * A path-normalized, snapshot-tracking store for external-world artifacts
 * produced during an agent session (files created/edited, etc.).
 */
export class SideEffectStore {
  private readonly workingDir: string;
  private readonly artifacts: Map<string, Artifact> = new Map();

  constructor(workingDir: string) {
    this.workingDir = workingDir;
  }

  /** Normalize a path relative to the store's working directory. */
  private key(location: string): string {
    return normalizePath(location, this.workingDir);
  }

  /**
   * Record a new artifact. Stored under its normalized location.
   * Overwrites any existing entry with the same normalized path.
   */
  record(artifact: Artifact): void {
    this.artifacts.set(this.key(artifact.location), artifact);
  }

  /**
   * Retrieve an artifact by (possibly un-normalized) path.
   * Returns null if no artifact is found.
   */
  get(path: string): Artifact | null {
    return this.artifacts.get(this.key(path)) ?? null;
  }

  /**
   * Apply partial updates to an existing artifact.
   * Before applying, a snapshot of the artifact's current state is pushed
   * onto its `snapshots` array.
   */
  update(path: string, updates: Partial<Artifact>): void {
    const normalizedKey = this.key(path);
    const existing = this.artifacts.get(normalizedKey);
    if (!existing) return;

    const snapshot = {
      frameId: '',
      timestamp: Date.now(),
      state: existing.state,
    };

    const updated: Artifact = {
      ...existing,
      ...updates,
      snapshots: [...(existing.snapshots ?? []), snapshot],
    };

    this.artifacts.set(normalizedKey, updated);
  }

  /** Return all recorded artifacts as an array. */
  all(): Artifact[] {
    return Array.from(this.artifacts.values());
  }
}
