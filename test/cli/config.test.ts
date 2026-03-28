import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/cli/config.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-mem-config-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('should return defaults when no config file exists', async () => {
    const config = await loadConfig({ configDir: tmpDir });
    expect(config.digestDir).toContain('digests');
    expect(config.defaultModel).toBe('claude-haiku-4-5-20251001');
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
    delete process.env.HARNESS_MEM_MODEL;
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
    delete process.env.HARNESS_MEM_MODEL;
  });
});
