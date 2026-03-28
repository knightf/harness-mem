import type { HarnessMemConfig } from '../engine/types.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const DEFAULTS: HarnessMemConfig = {
  digestDir: path.join(os.homedir(), '.harness-mem', 'digests'),
  transcriptDir: path.join(os.homedir(), '.claude', 'projects'),
  defaultModel: 'claude-haiku-4-5-20251001',
  defaultProvider: 'anthropic',
  recap: { since: '24h', maxLength: 20000, maxFallbackDigests: 10 },
  clean: { olderThan: '30d' },
};

function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as Array<keyof T>) {
    const overrideVal = override[key];
    const baseVal = base[key];
    if (
      overrideVal !== null &&
      typeof overrideVal === 'object' &&
      !Array.isArray(overrideVal) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      ) as T[keyof T];
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal as T[keyof T];
    }
  }
  return result;
}

export async function loadConfig(options?: {
  configDir?: string;
  flags?: Record<string, unknown>;
}): Promise<HarnessMemConfig> {
  // 1. Start with defaults
  let config: HarnessMemConfig = { ...DEFAULTS, recap: { ...DEFAULTS.recap }, clean: { ...DEFAULTS.clean } };

  // 2. Read and deep-merge config file
  const configDir = options?.configDir ?? path.join(os.homedir(), '.harness-mem');
  const configPath = path.join(configDir, 'config.json');
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    const fileConfig = JSON.parse(raw) as Partial<HarnessMemConfig>;
    config = deepMerge(config as unknown as Record<string, unknown>, fileConfig as Record<string, unknown>) as unknown as HarnessMemConfig;
  } catch {
    // No config file or parse error — use current config as-is
  }

  // 3. Apply env var overrides
  if (process.env.HARNESS_MEM_DIGEST_DIR) {
    config.digestDir = process.env.HARNESS_MEM_DIGEST_DIR;
  }
  if (process.env.HARNESS_MEM_TRANSCRIPT_DIR) {
    config.transcriptDir = process.env.HARNESS_MEM_TRANSCRIPT_DIR;
  }
  if (process.env.HARNESS_MEM_MODEL) {
    config.defaultModel = process.env.HARNESS_MEM_MODEL;
  }

  // 4. Apply CLI flag overrides
  const flags = options?.flags;
  if (flags) {
    if (typeof flags.digestDir === 'string') config.digestDir = flags.digestDir;
    if (typeof flags.transcriptDir === 'string') config.transcriptDir = flags.transcriptDir;
    if (typeof flags.model === 'string') config.defaultModel = flags.model;
    if (typeof flags.provider === 'string') config.defaultProvider = flags.provider;
  }

  return config;
}
