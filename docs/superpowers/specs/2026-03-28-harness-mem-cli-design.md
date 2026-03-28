# harness-mem: Agent Session Memory CLI

## Overview

harness-mem is a CLI tool that analyzes AI agent session logs and produces human-readable, detail-rich summaries. It hooks into Claude Code's session lifecycle to automatically capture what happened in each session and brief the user when they return.

The core philosophy: agent sessions have natural **boundaries** (shifts in task, tool usage patterns, goal changes), context **decays** (early exploration matters less than final decisions), and **side effects** are the ground truth of what actually changed in the world (files written, commands run). harness-mem uses these three lenses to distill a session trace into what matters.

## Problem

Coming back to agent work after hours or days is disorienting. You lose the "why" behind decisions, the state of in-progress work, and the context that made the session productive. Existing solutions (git log, reading code) tell you *what* changed but not *why* or *what was left open*.

## Design Principles

- **Human-first summaries**: Conversational but precise — reads like a handoff note from a teammate who includes file paths, line numbers, and decision rationale alongside the narrative.
- **Fast by default**: Recap must not block session start. No LLM calls in the default recap path.
- **Belt-and-suspenders reliability**: Primary digest path via SessionEnd hook, fallback via recap catching undigested sessions.
- **Zero-config start**: Works out of the box with sensible defaults. All settings overridable.

## Commands

### `harness-mem digest`

Analyzes a session transcript and writes a digest file.

**Input (priority order):**
1. Stdin JSON (when invoked as a hook) — parses `session_id` and `transcript_path` from the Claude Code hook payload
2. CLI argument — `harness-mem digest <path>` for manual invocation (session ID extracted from filename)
3. If stdin is empty/malformed and no CLI argument, exits with error

Claude Code hook stdin schema (fields we consume):
```json
{
  "session_id": "6b293462-4df0-46b0-88ea-dbc9a44df147",
  "transcript_path": "/home/user/.claude/projects/C--Users-Eric-Repos-harness/6b293462-....jsonl",
  "cwd": "C:\\Users\\Eric\\Repos\\harness",
  "hook_event_name": "SessionEnd"
}
```

**Behavior:**
1. Parse JSONL transcript into normalized events
2. Replay events through the scope engine (boundary detection, frame management, decay scoring, side effect extraction)
3. Call LLM with the resolved scope to generate a human-readable summary
4. Write digest file to the digest directory

**Idempotency:** If a digest for the given session ID already exists, skip unless `--force` is passed.

**Flags:**
- `--digest-dir <path>` — Override digest output directory
- `--model <model>` — LLM model for summarization (default: `claude-haiku-4-5-20251001`)
- `--force` — Overwrite existing digest for this session

**Output:** Silent on success (designed to run as a hook).

### `harness-mem recap`

Reads saved digests and prints a briefing to stdout.

**Behavior:**
1. **Fallback digest** — Scan all project directories under `~/.claude/projects/` for undigested transcripts:
   - Compare transcript session IDs against existing digests in the digest directory
   - Only consider transcripts created within the `recap.since` time window (default 24h)
   - Cap at 10 undigested sessions (configurable via `recap.maxFallbackDigests`) to avoid burst processing
   - Spawn `harness-mem digest` as a detached background process for each undigested transcript
   - Print a note: "N sessions are being digested in the background."
2. Read digest files, filter by time window, sort newest-first
3. Concatenate digests until hitting the max-length limit. If truncated, append: "... and N more sessions not shown. Run `harness-mem recap --no-limit` to see all."
4. Print to stdout (injected into Claude's context by SessionStart hook)

**Flags:**
- `--since <duration>` — Time window (default: `24h`)
- `--max-length <chars>` — Character limit for concatenated output (default: `20000`)
- `--no-limit` — No character limit
- `--digest-dir <path>` — Override digest directory

**Performance:** The default path is sync file reads and string concatenation only — no LLM calls, no network. Should complete well under a second.

### `harness-mem clean`

Deletes old digest files.

**Flags:**
- `--older-than <duration>` — Age threshold (default: `30d`)
- `--before <date>` — Absolute date cutoff
- `--dry-run` — Preview what would be deleted

## Architecture

### Data Flow

```
JSONL log → Trace Parser → Normalized Events
  → Scope Engine (replay iterator, boundaries, decay, side effects)
    → Resolved Scope (retained entries + side effects + frame structure)
      → Summarizer (LLM) → Markdown digest file
```

### Modules

#### 1. Trace Parser

Reads Claude Code JSONL session logs and normalizes them into an internal event format: messages, tool calls (with inputs/outputs), and results. This is the only module aware of the JSONL format — everything downstream works with normalized events.

#### 2. Scope Engine

Ported from the original harness project. Replays normalized events through a frame-based analysis model:

- **Replay Iterator**: Walks through events sequentially, feeding them to the engine. Supports resolution-point inspection for debugging — you can pause at any point and inspect the full scope state.
- **Boundary Detector**: Identifies where logical work units start and end using heuristic signals: tool type switches (reading → writing → testing), topic shifts in user messages, time gaps between events. Pushes new frames at boundaries.
- **Decay Scorer**: Scores entries by relevance. Recent events score higher. Final decisions outweigh intermediate exploration. Side effects outweigh read-only operations. Superseded attempts score low.
- **Side Effect Extractor**: Identifies external world changes: files created/modified/deleted, commands run, git operations. These are the "facts" of the session.

At the end of replay, the scope chain resolves what's still relevant — the surviving context with its associated side effects and frame structure.

#### 3. Summarizer

Takes the resolved scope and calls an LLM to produce the human-readable summary. The prompt provides the structured analysis (retained entries, side effects, frame boundaries, decay scores) and asks for the "handoff note" style output.

Uses the Vercel AI SDK (`ai` package) with a dynamic provider registry. Ships with `@ai-sdk/anthropic` as the default. Users can configure alternative providers by installing the corresponding SDK package (e.g., `npm install @ai-sdk/openai`) and setting `defaultProvider: "openai"` in config. Missing providers fail gracefully with an install instruction.

#### 4. CLI

Thin command layer using a lightweight argument parser. Orchestrates the pipeline for each command. Handles configuration loading, flag parsing, and hook integration concerns.

#### 5. Storage (Digest Store)

Manages digest files on disk: write, read, query by time range, query by session ID, delete by age. Handles the deduplication check for idempotent digests.

## Digest File Format

Stored at `~/.harness-mem/digests/YYYY-MM-DD-HHmmss-<short-hash>.md`

The short hash is derived from the session ID for deduplication.

```markdown
---
session_id: abc123
timestamp: 2026-03-28T14:30:00Z
duration_minutes: 45
model: claude-haiku-4-5-20251001
working_directory: /Users/eric/repos/harness
---

## What you worked on

You were building the trace replay iterator for the harness scope engine.
Started by reading the existing trace adapter (`src/trace/adapter.ts`) to
understand the JSONL decomposition, then implemented the replay logic in
`src/trace/replay.ts` (lines 12-89) with boundary detection at tool-cluster
switches.

## What changed

- Created `src/trace/replay.ts` — TraceReplayIterator class with resolution points
- Modified `src/trace/adapter.ts:34` — added side-effect detection for file writes
- Created `test/trace/replay.test.ts` — 4 test cases covering boundary detection

## Decisions made

- Used generator pattern for the iterator instead of callbacks — keeps memory
  flat for large traces
- Chose tool-cluster heuristic over semantic boundary detection for v1

## Still open

- Integration test with real JSONL fixture not yet written
- `side-effect-detector.ts` only handles file operations, not git commands yet
```

The YAML frontmatter is machine-readable metadata for recap to filter and sort. The body is the LLM-generated summary.

## Hook Integration

### Configuration

Added to Claude Code's `settings.json` (user or project level):

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

### SessionEnd → digest

- Fires once when the session terminates (user exits, Ctrl+D, /clear, etc.)
- Receives JSON on stdin with `session_id` and `transcript_path`
- Known reliability gaps: `/exit` command may not trigger on Windows, SIGTERM/SIGINT may not fire it
- This is acceptable because recap provides a fallback

### SessionStart → recap

- Fires on `startup` only (not resume, clear, or compact)
- Runs synchronously — stdout is injected into Claude's context
- Must be fast: default path is file reads + concatenation, no LLM calls
- Fallback digests for missed sessions are spawned as detached background processes

## Configuration

**File:** `~/.harness-mem/config.json`

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

**Priority order:** CLI flags > environment variables > config file > defaults

**Environment variables:**
- `HARNESS_MEM_DIGEST_DIR` — Digest directory
- `HARNESS_MEM_TRANSCRIPT_DIR` — Transcript directory
- `HARNESS_MEM_MODEL` — Default LLM model

## Transcript Discovery

Claude Code stores session transcripts at `~/.claude/projects/<mangled-project-path>/<session-uuid>.jsonl`. The project path is mangled by replacing path separators with `--` (e.g., `C:\Users\Eric\Repos\harness` → `C--Users-Eric-Repos-harness`).

**Discovery process (used by recap fallback):**
1. List all project directories under `~/.claude/projects/`
2. Glob `*.jsonl` in each project directory — each file is a session transcript
3. Extract session UUID from filename (the filename without `.jsonl` extension)
4. Compare against existing digests by session ID
5. Filter by file creation time within the configured `recap.since` window
6. Cap at `recap.maxFallbackDigests` (default 10) sessions

Note: No active session PID check. If an in-progress session gets digested, the incomplete digest is harmless — it gets overwritten when that session ends via SessionEnd, and idempotency by session ID prevents duplicates.

**JSONL transcript line schema (fields we consume):**
- `type` — `"user"`, `"assistant"`, `"progress"`, `"file-history-snapshot"`
- `timestamp` — ISO 8601
- `sessionId` — session UUID
- `cwd` — working directory at time of message
- `message` — contains `role` and `content` (for user/assistant types)

Sub-agent transcripts at `<session-uuid>/subagents/agent-<id>.jsonl` are included in the analysis when present.

## Repo Strategy

This is a clean rewrite (Approach B) within the existing repository:
- Rename package from `harness` to `harness-mem` in `package.json`
- Replace `src/` with the new module structure
- Update dependencies: add `ai`, `@ai-sdk/anthropic`, `commander`; remove `@anthropic-ai/sdk`, `uuid`
- Keep `docs/` — design specs document the project's evolution
- Original code preserved in git history

## Project Structure

```
harness/
├── src/
│   ├── cli/                  # CLI entry point and command handlers
│   │   ├── index.ts          # Main CLI entry, argument parsing
│   │   ├── digest.ts         # digest command handler
│   │   ├── recap.ts          # recap command handler
│   │   └── clean.ts          # clean command handler
│   ├── parser/               # JSONL trace parsing
│   │   └── trace-parser.ts   # Claude Code JSONL → normalized events
│   ├── engine/               # Scope engine (ported from original harness)
│   │   ├── types.ts          # Core types
│   │   ├── scope-engine.ts   # Frame management, entry tracking
│   │   ├── replay.ts         # Trace replay iterator with inspection API
│   │   ├── boundary.ts       # Heuristic boundary detection
│   │   ├── decay.ts          # Decay scoring
│   │   └── side-effects.ts   # Side effect extraction
│   ├── summarizer/           # LLM-powered summary generation
│   │   ├── summarizer.ts     # Prompt construction + LLM call
│   │   └── formatter.ts      # Digest markdown formatting
│   └── storage/              # Digest file management
│       └── digest-store.ts   # Read/write/query/clean digest files
├── test/
├── docs/
├── package.json
├── tsconfig.json
└── bin/
    └── harness-mem           # CLI executable entry point
```

## Tech Stack

- **Language:** TypeScript (ES2022, NodeNext modules)
- **Test framework:** Vitest
- **LLM integration:** Vercel AI SDK (`ai`) with `@ai-sdk/anthropic` as default provider
- **CLI parsing:** Lightweight parser (commander or hand-rolled)
- **Runtime:** Node.js via `tsx` initially, `tsc` build for npm publishing

## What Gets Ported from Original Harness

- JSONL parsing logic (`src/trace/adapter.ts`)
- Trace replay iterator with resolution point inspection (`src/trace/replay.ts`)
- Boundary detection heuristics (`src/boundary/tool-cluster.ts`)
- Decay scoring (`src/decay/decay-engine.ts`)
- Side effect detection (`src/trace/side-effect-detector.ts`)
- Scope engine frame management (`src/core/scope-engine.ts`)
- Core types (trimmed to what's needed)

## What Gets Dropped

- Semantic boundary detector (LLM-based, overkill for post-hoc analysis)
- LLM compactor (runtime optimization not needed)
- Claude LLM provider (replaced by Vercel AI SDK)

## Future Considerations (not in scope)

- `--format agent` flag for machine-readable summaries optimized for agent context injection
- Additional trace format support beyond Claude Code JSONL
- LLM-powered recap synthesis as default (once speed/cost is acceptable)
- Automatic cleanup via cron or scheduled task
- Web dashboard for browsing digests
