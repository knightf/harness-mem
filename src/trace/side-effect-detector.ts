import { normalizePath } from '../core/utils.js';

const SIDE_EFFECT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);
const NO_SIDE_EFFECT_TOOLS = new Set(['Read', 'Glob', 'Grep']);

const BASH_SIDE_EFFECT_PATTERNS = /\b(mkdir|rm|mv|cp|git\s+(add|commit|push|checkout|reset)|>\s*\S)/i;

export function detectSideEffect(
  toolName: string,
  toolParams: unknown,
  cwd: string
): { hasSideEffect: boolean; paths: string[] } {
  if (NO_SIDE_EFFECT_TOOLS.has(toolName)) {
    return { hasSideEffect: false, paths: [] };
  }

  if (SIDE_EFFECT_TOOLS.has(toolName)) {
    const params = toolParams as Record<string, unknown>;
    const filePath = params?.file_path as string | undefined;
    return {
      hasSideEffect: true,
      paths: filePath ? [normalizePath(filePath, cwd)] : [],
    };
  }

  if (toolName === 'Bash') {
    const params = toolParams as Record<string, unknown>;
    const command = params?.command as string | undefined;
    if (command && BASH_SIDE_EFFECT_PATTERNS.test(command)) {
      return { hasSideEffect: true, paths: [] };
    }
    return { hasSideEffect: false, paths: [] };
  }

  return { hasSideEffect: false, paths: [] };
}
