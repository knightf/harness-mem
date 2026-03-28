import type { DigestMetadata } from '../engine/types.js';

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
