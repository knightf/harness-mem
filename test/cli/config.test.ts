import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/cli/config.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let tmpDir: string;
const originalEnv = {
  HARNESS_MEM_MODEL: process.env.HARNESS_MEM_MODEL,
  HARNESS_MEM_PROVIDER: process.env.HARNESS_MEM_PROVIDER,
  HARNESS_MEM_DIGEST_DIR: process.env.HARNESS_MEM_DIGEST_DIR,
  HARNESS_MEM_TRANSCRIPT_DIR: process.env.HARNESS_MEM_TRANSCRIPT_DIR,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-config-'));
  delete process.env.HARNESS_MEM_MODEL;
  delete process.env.HARNESS_MEM_PROVIDER;
  delete process.env.HARNESS_MEM_DIGEST_DIR;
  delete process.env.HARNESS_MEM_TRANSCRIPT_DIR;
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('loadConfig', () => {
  it('should return defaults when no config file exists', async () => {
    const config = await loadConfig({ configDir: tmpDir });
    expect(config.digestDir).toContain('digests');
    expect(config.defaultModel).toBeUndefined();
    expect(config.defaultProvider).toBe('anthropic');
    expect(config.recap.since).toBe('24h');
    expect(config.recap.maxLength).toBe(20000);
    expect(config.recap.maxFallbackDigests).toBe(10);
    expect(config.clean.olderThan).toBe('30d');
  });

  it('should merge config file values over defaults', async () => {
    const configPath = path.join(tmpDir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify({
      defaultModel: 'claude-sonnet-4-20250514',
      recap: { maxLength: 50000 },
    }));
    const config = await loadConfig({ configDir: tmpDir });
    expect(config.defaultModel).toBe('claude-sonnet-4-20250514');
    expect(config.recap.maxLength).toBe(50000);
    expect(config.recap.since).toBe('24h');
  });

  it('should apply env var overrides', async () => {
    process.env.HARNESS_MEM_MODEL = 'gpt-4o';
    const config = await loadConfig({ configDir: tmpDir });
    expect(config.defaultModel).toBe('gpt-4o');
  });

  it('should apply provider env var override', async () => {
    process.env.HARNESS_MEM_PROVIDER = 'openai';
    const config = await loadConfig({ configDir: tmpDir });
    expect(config.defaultProvider).toBe('openai');
  });

  it('should apply CLI flag overrides', async () => {
    const config = await loadConfig({
      configDir: tmpDir,
      flags: { digestDir: '/custom/path', model: 'custom-model' },
    });
    expect(config.digestDir).toBe('/custom/path');
    expect(config.defaultModel).toBe('custom-model');
  });

  it('should respect priority: flags > env > file > defaults', async () => {
    const configPath = path.join(tmpDir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify({ defaultModel: 'from-file' }));
    process.env.HARNESS_MEM_MODEL = 'from-env';
    const config = await loadConfig({
      configDir: tmpDir,
      flags: { model: 'from-flag' },
    });
    expect(config.defaultModel).toBe('from-flag');
  });

  it('should load env vars from .env in configDir', async () => {
    const envPath = path.join(tmpDir, '.env');
    await fs.writeFile(envPath, 'ANTHROPIC_API_KEY=from-dotenv\nHARNESS_MEM_MODEL=dotenv-model\n');

    const config = await loadConfig({ configDir: tmpDir });

    expect(process.env.ANTHROPIC_API_KEY).toBe('from-dotenv');
    expect(config.defaultModel).toBe('dotenv-model');
  });

  it('should not override existing OS env vars with .env values', async () => {
    process.env.ANTHROPIC_API_KEY = 'from-os';
    process.env.HARNESS_MEM_MODEL = 'from-os-model';
    const envPath = path.join(tmpDir, '.env');
    await fs.writeFile(envPath, 'ANTHROPIC_API_KEY=from-dotenv\nHARNESS_MEM_MODEL=dotenv-model\n');

    const config = await loadConfig({ configDir: tmpDir });

    expect(process.env.ANTHROPIC_API_KEY).toBe('from-os');
    expect(config.defaultModel).toBe('from-os-model');
  });
});
