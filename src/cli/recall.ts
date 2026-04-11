import type { Logger } from 'pino';
import fs from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'path';
import type { IndexEntry } from '../storage/digest-store.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecallOptions {
  digestDir: string;
  prompt: string;
  maxChars?: number;
  logger?: Logger;
}

interface RecallResult {
  additionalContext: string;
}

// ─── Stopwords to filter from prompt ──────────────────────────────────────────

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'like',
  'through', 'after', 'over', 'between', 'out', 'up', 'down', 'off',
  'and', 'or', 'but', 'not', 'no', 'nor', 'so', 'yet', 'both',
  'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he',
  'she', 'they', 'them', 'this', 'that', 'these', 'those', 'what',
  'which', 'who', 'how', 'when', 'where', 'why', 'if', 'then',
  'just', 'also', 'very', 'too', 'some', 'any', 'all', 'each',
  'let', 'lets', 'please', 'want', 'need', 'make', 'get', 'use',
]);

// ─── runRecall ───────────────────────────────────────────────────────────────

export async function runRecall(options: RecallOptions): Promise<RecallResult> {
  const { digestDir, prompt, maxChars = 8000, logger } = options;
  const indexPath = path.join(digestDir, 'constraints.jsonl');

  // Extract search terms from prompt
  const terms = extractTerms(prompt);
  logger?.debug({ termCount: terms.length, terms }, 'recall: extracted search terms');
  if (terms.length === 0) {
    logger?.debug('recall: no search terms extracted, skipping');
    return { additionalContext: '' };
  }

  // Stream index file line-by-line to avoid buffering the whole file
  const scored: Array<{ entry: IndexEntry; score: number }> = [];
  let malformed = 0;
  let lineCount = 0;

  try {
    const rl = createInterface({
      input: fs.createReadStream(indexPath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line) continue;
      lineCount++;
      try {
        const entry: IndexEntry = JSON.parse(line);
        if (entry.disabled) continue;
        if (entry.type === 'todo' || entry.type === 'question') continue;
        const score = scoreMatch(terms, entry);
        if (score > 0) {
          scored.push({ entry, score });
        }
      } catch {
        malformed++;
      }
    }
  } catch {
    logger?.debug({ indexPath }, 'recall: no constraint index found');
    return { additionalContext: '' };
  }

  logger?.debug({ lineCount }, 'recall: streamed constraint index');

  if (malformed > 0) {
    logger?.warn({ malformed }, 'recall: skipped malformed lines in constraint index');
  }

  if (scored.length === 0) {
    logger?.debug('recall: no matching constraints found');
    return { additionalContext: '' };
  }

  // Sort by score descending, take top matches within budget
  scored.sort((a, b) => b.score - a.score);

  const parts: string[] = [];
  let totalLen = 0;

  for (const { entry } of scored) {
    const line = `[${entry.type}] ${entry.content}`;
    if (totalLen + line.length > maxChars) break;
    parts.push(line);
    totalLen += line.length;
  }

  if (parts.length === 0) {
    return { additionalContext: '' };
  }

  logger?.info({ matched: scored.length, returned: parts.length }, 'recall: returning constraints');

  const context = 'Relevant constraints from previous sessions:\n\n' + parts.join('\n');
  return { additionalContext: context };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function extractTerms(prompt: string): string[] {
  const words = prompt
    .toLowerCase()
    .split(/[\s/\\.,:;!?()[\]{}<>'"]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return [...new Set(words)].slice(0, 15);
}

export function scoreMatch(terms: string[], entry: IndexEntry): number {
  let score = 0;
  const keywords = (entry.keywords ?? []).map((k) => k.toLowerCase());
  const contentLower = entry.content.toLowerCase();

  for (const term of terms) {
    // Exact keyword match — strongest signal
    if (keywords.includes(term)) {
      score += 3;
    }
    // Partial keyword match (term is substring of a keyword or vice versa)
    else if (keywords.some((k) => k.includes(term) || term.includes(k))) {
      score += 2;
    }
    // Content match — weaker but still useful
    else if (contentLower.includes(term)) {
      score += 1;
    }
  }

  return score;
}
