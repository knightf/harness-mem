# Quickstart: Local Development Testing

## Prerequisites

- Node.js installed
- `ANTHROPIC_API_KEY` environment variable set

## Install Locally

### Option 1: npm link (recommended)

Creates a global symlink — changes to source are reflected immediately:

```bash
cd C:\Users\Eric\Repos\harness
npm link
```

Now `harness-mem` is available as a command anywhere:

```bash
harness-mem --help
```

To unlink later:

```bash
npm unlink -g harness-mem
```

### Option 2: Run directly without installing

```bash
npx tsx bin/harness-mem.ts --help
```

## Test with a Real Session

1. Find a transcript file (Claude Code stores them at `~/.claude/projects/<project-name>/<session-uuid>.jsonl`):

```bash
ls ~/.claude/projects/
ls ~/.claude/projects/<pick-a-project>/
```

2. Run digest on it:

```bash
harness-mem digest <path-to-session.jsonl>
```

Or with the direct method:

```bash
npx tsx bin/harness-mem.ts digest <path-to-session.jsonl>
```

3. Check the output:

```bash
ls ~/.harness-mem/digests/
cat ~/.harness-mem/digests/*.md
```

4. Test recap:

```bash
harness-mem recap
```

5. Test clean (dry run first):

```bash
harness-mem clean --dry-run
```

## Set Up Claude Code Hooks

Once you're happy with the output, add hooks to your Claude Code settings (`~/.claude/settings.json`):

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

## Troubleshooting

**"No transcript path provided"** — The digest command needs either a file argument or stdin JSON from a hook. Pass the path explicitly: `harness-mem digest <file>`.

**Empty recap** — No digests exist yet. Run `harness-mem digest` on a transcript first.

**LLM errors** — Check that `ANTHROPIC_API_KEY` is set and valid.

**Digest looks wrong** — Try `harness-mem digest --force <file>` to regenerate it. Use `--model claude-sonnet-4-20250514` for better quality summaries (costs more).
