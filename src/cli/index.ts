import { Command } from 'commander';
import { runDigest } from './digest.js';
import { runRecap } from './recap.js';
import { runClean } from './clean.js';
import { runRecall } from './recall.js';
import { DIGEST_CHILD_ENV, loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createInterface } from 'readline';
import { spawn } from 'child_process';

// ─── parseStdinPayload ────────────────────────────────────────────────────────

export interface StdinPayload {
  sessionId: string;
  transcriptPath: string;
  cwd: string;
}

interface DigestCommandOptions extends Record<string, unknown> {
  digestDir?: string;
  model?: string;
  force?: boolean;
  sessionId?: string;
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
    .option('--session-id <id>', 'Session ID (skip stdin when provided)')
    .option('--force', 'Overwrite existing digest', false)
    .action(async (transcriptPathArg: string | undefined, options: DigestCommandOptions) => {
      const config = await loadConfig({ flags: options });
      const logger = createLogger();
      const cliTranscriptPath = transcriptPathArg;
      const cliSessionId = typeof options.sessionId === 'string' ? options.sessionId : undefined;
      const force = (options.force as boolean | undefined) ?? false;

      let payload: StdinPayload | null = null;
      if (!cliTranscriptPath || !cliSessionId) {
        const stdinRaw = await readStdin();
        payload = parseStdinPayload(stdinRaw);
      }

      const transcriptPath = cliTranscriptPath ?? payload?.transcriptPath ?? '';
      const sessionId = cliSessionId ?? payload?.sessionId ?? '';

      logger.info({ transcriptPath, sessionId }, 'digest: starting');
      try {
        if (process.env[DIGEST_CHILD_ENV] === '1') {
          await runDigest({
            transcriptPath,
            sessionId,
            digestDir: config.digestDir,
            model: config.defaultModel,
            provider: config.defaultProvider,
            force,
            logger,
          });
          logger.info({ sessionId }, 'digest: completed');
          return;
        }

        const childArgs = [
          process.argv[1] || 'harness-mem',
          'digest',
          transcriptPath,
          '--session-id',
          sessionId,
          '--digest-dir',
          config.digestDir,
        ];
        if (config.defaultModel) {
          childArgs.push('--model', config.defaultModel);
        }

        if (force) {
          childArgs.push('--force');
        }

        const child = spawn(process.execPath, childArgs, {
          detached: true,
          stdio: 'ignore',
          env: {
            ...process.env,
            [DIGEST_CHILD_ENV]: '1',
          },
        });
        child.unref();
        logger.info({ sessionId, pid: child.pid }, 'digest: spawned detached worker');
      } catch (err) {
        logger.error({ err, sessionId }, 'digest: failed');
        throw err;
      }
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
      const logger = createLogger();

      const maxLength = options.limit === false
        ? Number.MAX_SAFE_INTEGER
        : typeof options.maxLength === 'string'
          ? parseInt(options.maxLength, 10)
          : config.recap.maxLength;

      logger.info({ since: typeof options.since === 'string' ? options.since : config.recap.since }, 'recap: starting');
      const result = await runRecap({
        digestDir: config.digestDir,
        since: typeof options.since === 'string' ? options.since : config.recap.since,
        maxLength,
        logger,
      });
      logger.info('recap: completed');

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
      const logger = createLogger();

      logger.info({ dryRun: options.dryRun }, 'clean: starting');
      const result = await runClean({
        digestDir: config.digestDir,
        olderThan: typeof options.olderThan === 'string' ? options.olderThan : config.clean.olderThan,
        before: typeof options.before === 'string' ? options.before : undefined,
        dryRun: (options.dryRun as boolean | undefined) ?? false,
        logger,
      });

      if (options.dryRun) {
        logger.info({ wouldDelete: result.wouldDelete }, 'clean: dry run completed');
        process.stdout.write(`Would delete ${result.wouldDelete} digest(s).\n`);
      } else {
        logger.info({ deleted: result.deleted }, 'clean: completed');
        process.stdout.write(`Deleted ${result.deleted} digest(s).\n`);
      }
    });

  program
    .command('recall')
    .description('Retrieve relevant constraints for a prompt (used by UserPromptSubmit hook)')
    .option('--digest-dir <dir>', 'Directory to read constraint index from')
    .option('--max-chars <n>', 'Maximum character length of output', '8000')
    .action(async (options: Record<string, unknown>) => {
      const config = await loadConfig({ flags: options });
      const logger = createLogger();

      // Read prompt from stdin (hook pipes JSON with .prompt field)
      const stdinRaw = await readStdin();
      let prompt = '';
      try {
        const parsed = JSON.parse(stdinRaw);
        prompt = typeof parsed.prompt === 'string' ? parsed.prompt : '';
      } catch {
        // Plain text stdin — use as-is
        logger.debug('recall: stdin is plain text, not JSON');
        prompt = stdinRaw;
      }

      if (!prompt) {
        logger.debug('recall: empty prompt, skipping');
        return;
      }

      logger.info('recall: starting');
      const result = await runRecall({
        digestDir: config.digestDir,
        prompt,
        maxChars: parseInt(String(options.maxChars), 10) || 8000,
        logger,
      });
      logger.info({ hasContext: !!result.additionalContext }, 'recall: completed');

      if (result.additionalContext) {
        process.stdout.write(JSON.stringify(result) + '\n');
      }
    });

  program
    .command('manage')
    .description('Interactive constraint control panel — browse, search, simulate recall, and toggle constraints')
    .option('--digest-dir <dir>', 'Directory to read constraints from')
    .action(async (options: Record<string, unknown>) => {
      const config = await loadConfig({ flags: options });
      const modulePath = '../tui/manage.js';
      const { launchManage } = await import(/* webpackIgnore: true */ modulePath);
      await launchManage({ digestDir: config.digestDir });
    });

  return program;
}

// ─── run ──────────────────────────────────────────────────────────────────────

export async function run(argv: string[]): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv);
}
