import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import type { TokenEstimator } from './types.js';

export function generateId(): string {
  return uuidv4();
}

export function normalizePath(filePath: string, cwd: string): string {
  return path.resolve(cwd, filePath).toLowerCase();
}

export class SimpleTokenEstimator implements TokenEstimator {
  estimate(content: unknown): number {
    if (content === null || content === undefined) return 0;
    const str = typeof content === 'string' ? content : JSON.stringify(content);
    return Math.ceil(str.length / 4);
  }
}
