import { Command } from 'commander';
import { runDigest } from './digest.js';
import { runRecap } from './recap.js';
import { runClean } from './clean.js';
import { loadConfig } from './config.js';
import { createInterface } from 'readline';

// ─── parseStdinPayload ────────────────────────────────────────────────────────

export interface StdinPayload {
  sessionId: string;
  transcriptPath: string;
  cwd: string;
}

export function parseStdinPayload(raw: string): StdinPayload | null {
  if (raw === '') return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  const sessionId = parsed.session_id;
  const transcriptPath = parsed.transcript_path;
  const cwd = parsed.cwd;

  if (typeof sessionId !== 'string' || typeof transcriptPath !== 'string') {
    return null;
  }

  return {
    sessionId,
    transcriptPath,
    cwd: typeof cwd === 'string' ? cwd : '',
  };
}

// ─── readStdin ────────────────────────────────────────────────────────────────

const STDIN_TIMEOUT_MS = 5000;

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return '';
  }

  return new Promise((resolve) => {
    const chunks: string[] = [];
    const rl = createInterface({ input: process.stdin });
    const timeout = setTimeout(() => {
      rl.close();
      resolve(chunks.join('\n'));
    }, STDIN_TIMEOUT_MS);
    rl.on('line', (line) => chunks.push(line));
    rl.on('close', () => {
      clearTimeout(timeout);
      resolve(chunks.join('\n'));
    });
  });
}

// ─── buildProgram ─────────────────────────────────────────────────────────────

export function buildProgram(): Command {
  const program = new Command('harness-mem');

  program
    .command('digest [path]')
    .description('Digest a session transcript into a summary')
    .option('--digest-dir <dir>', 'Directory to store digests')
    .option('--model <model>', 'LLM model to use for summarization')
    .option('--force', 'Overwrite existing digest', false)
    .action(async (transcriptPathArg: string | undefined, options: Record<string, unknown>) => {
      const config = await loadConfig({ flags: options });
      const stdinRaw = await readStdin();
      const payload = parseStdinPayload(stdinRaw);

      const transcriptPath = transcriptPathArg ?? payload?.transcriptPath ?? '';
      const sessionId = payload?.sessionId ?? '';

      await runDigest({
        transcriptPath,
        sessionId,
        digestDir: config.digestDir,
        model: config.defaultModel,
        provider: config.defaultProvider,
        force: (options.force as boolean | undefined) ?? false,
      });
    });

  program
    .command('recap')
    .description('Display recent session summaries')
    .option('--since <duration>', 'Show sessions from the last duration (e.g. 24h, 7d)')
    .option('--max-length <n>', 'Maximum total character length of output')
    .option('--no-limit', 'Show all sessions without length limit')
    .option('--digest-dir <dir>', 'Directory to read digests from')
    .action(async (options: Record<string, unknown>) => {
      const config = await loadConfig({ flags: options });

      const maxLength = options.limit === false
        ? Number.MAX_SAFE_INTEGER
        : typeof options.maxLength === 'string'
          ? parseInt(options.maxLength, 10)
          : config.recap.maxLength;

      const result = await runRecap({
        digestDir: config.digestDir,
        since: typeof options.since === 'string' ? options.since : config.recap.since,
        maxLength,
      });

      process.stdout.write(result + '\n');
    });

  program
    .command('clean')
    .description('Remove old digest files')
    .option('--older-than <duration>', 'Delete digests older than this duration (e.g. 30d)')
    .option('--before <date>', 'Delete digests before this date')
    .option('--dry-run', 'Show what would be deleted without deleting', false)
    .action(async (options: Record<string, unknown>) => {
      const config = await loadConfig({ flags: options });

      const result = await runClean({
        digestDir: config.digestDir,
        olderThan: typeof options.olderThan === 'string' ? options.olderThan : config.clean.olderThan,
        before: typeof options.before === 'string' ? options.before : undefined,
        dryRun: (options.dryRun as boolean | undefined) ?? false,
      });

      if (options.dryRun) {
        process.stdout.write(`Would delete ${result.wouldDelete} digest(s).\n`);
      } else {
        process.stdout.write(`Deleted ${result.deleted} digest(s).\n`);
      }
    });

  return program;
}

// ─── run ──────────────────────────────────────────────────────────────────────

export async function run(argv: string[]): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv);
}
