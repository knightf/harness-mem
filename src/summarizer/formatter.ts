import type { DigestMetadata, SessionConstraints } from '../engine/types.js';

/**
 * Formats a digest as a markdown file with YAML frontmatter.
 */
export function formatDigest(metadata: DigestMetadata, body: string): string {
  const frontmatter = [
    '---',
    `session_id: ${metadata.sessionId}`,
    `timestamp: ${metadata.timestamp}`,
    `duration_minutes: ${metadata.durationMinutes}`,
    `model: ${metadata.model}`,
    `working_directory: ${metadata.workingDirectory}`,
    '---',
  ].join('\n');

  return `${frontmatter}\n\n${body}`;
}

/**
 * Parses a digest markdown string back into metadata and body.
 */
export function parseDigest(content: string): { metadata: DigestMetadata; body: string } {
  const parts = content.split(/^---\s*$/m);
  // parts[0] is empty (before first ---), parts[1] is frontmatter, parts[2+] is body
  if (parts.length < 3) {
    throw new Error('Invalid digest format: missing YAML frontmatter');
  }

  const frontmatterLines = parts[1].trim().split('\n');
  const raw: Record<string, string> = {};
  for (const line of frontmatterLines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    raw[key] = value;
  }

  const metadata: DigestMetadata = {
    sessionId: raw['session_id'] ?? '',
    timestamp: raw['timestamp'] ?? '',
    durationMinutes: Number(raw['duration_minutes'] ?? 0),
    model: raw['model'] ?? '',
    workingDirectory: raw['working_directory'] ?? '',
  };

  // Rejoin any remaining parts as body (handles --- inside body)
  const body = parts.slice(2).join('---').trim();

  return { metadata, body };
}

/**
 * Renders a lightweight recap: summary + open threads only.
 * Constraints (eliminations, decisions, invariants, preferences) are
 * handled by the recall command via the constraint index.
 */
export function formatRecapToMarkdown(constraints: SessionConstraints): string {
  const sections: string[] = [];

  if (constraints.summary) {
    sections.push(`## Summary\n\n${constraints.summary}`);
  }

  if (constraints.openThreads?.length) {
    const items = constraints.openThreads
      .map((t) => `- **[${t.type.toUpperCase()}]** ${t.what} — **Context:** ${t.context}`)
      .join('\n');
    sections.push(`## Open Threads\n\n${items}`);
  }

  return sections.join('\n\n');
}

/**
 * Renders SessionConstraints to human-readable markdown (all sections).
 * Pure function — no LLM calls.
 */
export function formatConstraintsToMarkdown(constraints: SessionConstraints): string {
  const sections: string[] = [];

  if (constraints.summary) {
    sections.push(`## Summary\n\n${constraints.summary}`);
  }

  if (constraints.eliminations?.length) {
    const items = constraints.eliminations
      .map((e) => `- **Don't:** ${e.dont} — **Because:** ${e.because}`)
      .join('\n');
    sections.push(`## Eliminations\n\n${items}`);
  }

  if (constraints.decisions?.length) {
    const items = constraints.decisions
      .map((d) => {
        const over = d.over.length > 0 ? d.over.join(', ') : 'no stated alternatives';
        return `- **Chose:** ${d.chose} **Over:** ${over} — **Because:** ${d.because}`;
      })
      .join('\n');
    sections.push(`## Decisions\n\n${items}`);
  }

  if (constraints.invariants?.length) {
    const items = constraints.invariants
      .map((i) => `- **Always:** ${i.always} — **Scope:** ${i.scope}`)
      .join('\n');
    sections.push(`## Invariants\n\n${items}`);
  }

  if (constraints.preferences?.length) {
    const items = constraints.preferences
      .map((p) => `- **Prefer:** ${p.prefer} **Over:** ${p.over} — **Context:** ${p.context}`)
      .join('\n');
    sections.push(`## Preferences\n\n${items}`);
  }

  if (constraints.openThreads?.length) {
    const items = constraints.openThreads
      .map((t) => `- **[${t.type.toUpperCase()}]** ${t.what} — **Context:** ${t.context}`)
      .join('\n');
    sections.push(`## Open Threads\n\n${items}`);
  }

  return sections.join('\n\n');
}
