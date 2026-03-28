# harness-mem

A CLI tool that analyzes AI agent session logs and produces human-readable summaries. Hooks into Claude Code's session lifecycle to automatically capture what happened in each session and brief you when you return.

[![NPM Version](https://nodei.co/npm/harness-mem.png)](https://npmjs.org/package/harness-mem)
[![coverage](https://knightf.github.io/harness-mem/badges/master/coverage.svg)](https://knightf.github.io/harness-mem/badges/master/coverage.svg)

## The Problem

Coming back to agent work after hours or days is disorienting. You lose the "why" behind decisions, the state of in-progress work, and the context that made the session productive. Git log tells you *what* changed but not *why* or *what was left open*.

## How It Works

harness-mem uses a scope engine inspired by JavaScript's execution model to analyze session transcripts:

- **Boundary detection** identifies where logical work units start and end (tool switches, topic shifts, time gaps)
- **Decay scoring** determines what's still relevant vs. what was intermediate exploration noise
- **Side effect tracking** captures what actually changed in the world (files created/modified, commands run)

The surviving context is sent to an LLM which produces a handoff-note-style summary — conversational but precise, with file paths and decision rationale.

## Installation

```bash
npm install -g harness-mem
```

Or run directly:

```bash
npx harness-mem
```

Requires an Anthropic API key set as `ANTHROPIC_API_KEY`, either in your shell environment or in `~/.harness-mem/.env`.

## Commands

### `harness-mem digest`

Analyze a session transcript and write a summary digest.

```bash
# Manual: pass a transcript file path
harness-mem digest path/to/session.jsonl --session-id abc

# As a hook: reads session_id and transcript_path from stdin JSON
echo '{"session_id":"abc","transcript_path":"path/to/session.jsonl"}' | harness-mem digest
```

**Flags:**
- `--digest-dir <path>` — Where to store digests (default: `~/.harness-mem/digests/`)
- `--model <model>` — LLM model for summarization (default: `claude-haiku-4-5-20251001`)
- `--force` — Overwrite existing digest for this session

### `harness-mem recap`

Print a briefing of recent session summaries.

```bash
harness-mem recap
harness-mem recap --since 48h
harness-mem recap --max-length 10000
```

**Flags:**
- `--since <duration>` — Time window: `Nm`, `Nh`, `Nd` (default: `24h`)
- `--max-length <chars>` — Character limit for output (default: `20000`)
- `--no-limit` — No character limit
- `--digest-dir <path>` — Override digest directory

### `harness-mem clean`

Delete old digest files.

```bash
harness-mem clean
harness-mem clean --older-than 7d
harness-mem clean --before 2026-03-01 --dry-run
```

**Flags:**
- `--older-than <duration>` — Age threshold (default: `30d`)
- `--before <date>` — Delete digests before this date
- `--dry-run` — Preview what would be deleted

## Claude Code Hook Integration

Add to your Claude Code `settings.json` to automatically digest sessions and get briefed on startup:

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "hooks": [{
          "type": "command",
          "command": "harness-mem digest"
        }]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [{
          "type": "command",
          "command": "harness-mem recap --since 24h"
        }]
      }
    ]
  }
}
```

**How it works:**
- **SessionEnd** fires when a session terminates. `harness-mem digest` reads the session info from stdin (provided by Claude Code) and produces a summary.
- **SessionStart** fires when you open a new session. `harness-mem recap` prints recent summaries to stdout, which Claude Code injects into the agent's context — so the agent knows what you've been working on.

If the `SessionEnd` hook doesn't fire (known reliability gaps on some exit paths), `recap` has a fallback: it scans for undigested transcripts and spawns background digest processes before printing the briefing.

## Configuration

Create `~/.harness-mem/config.json` for persistent settings:

```json
{
  "digestDir": "~/.harness-mem/digests",
  "transcriptDir": "~/.claude/projects",
  "defaultModel": "claude-haiku-4-5-20251001",
  "defaultProvider": "anthropic",
  "recap": {
    "since": "24h",
    "maxLength": 20000,
    "maxFallbackDigests": 10
  },
  "clean": {
    "olderThan": "30d"
  }
}
```

**Override priority:** CLI flags > environment variables > config file > defaults

**Environment variables:**
- `HARNESS_MEM_DIGEST_DIR`
- `HARNESS_MEM_TRANSCRIPT_DIR`
- `HARNESS_MEM_MODEL`
- `ANTHROPIC_API_KEY`

You can also create `~/.harness-mem/.env`:

```env
ANTHROPIC_API_KEY=your_api_key_here
HARNESS_MEM_MODEL=claude-haiku-4-5-20251001
```

Values from `~/.harness-mem/.env` are loaded automatically at startup and inherited by child processes. Existing OS environment variables still take precedence over `.env` values.

**Detailed precedence:** CLI flags > existing OS environment variables > `~/.harness-mem/.env` > config file > defaults

## Digest Format

Digests are markdown files with YAML frontmatter, stored at `~/.harness-mem/digests/`:

```markdown
---
session_id: 6b293462-4df0-46b0-88ea-dbc9a44df147
timestamp: 2026-03-28T14:30:00Z
duration_minutes: 45
model: claude-haiku-4-5-20251001
working_directory: /home/user/repos/myproject
---

## What you worked on

You were refactoring the auth middleware (`src/auth/middleware.ts`)
because the compliance team flagged session token storage...

## What changed

- Modified `src/auth/middleware.ts:42-89` — replaced in-memory session store
- Updated `src/routes/auth.ts:23` — added TODO for new signature

## Decisions made

- Chose signed cookie approach over JWT for session management

## Still open

- Route handlers need updating to use new `validateSession()` signature
```

## Development

```bash
git clone <repo-url>
cd harness
npm install

npm test            # Run tests (94 tests)
npm run test:watch  # Watch mode
npm run build       # TypeScript compilation
npm run dev         # Run CLI via tsx
```

## License

ISC
