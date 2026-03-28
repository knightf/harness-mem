import { describe, it, expect } from 'vitest';
import { detectSideEffect, SideEffectStore } from '../../src/engine/side-effects.js';

describe('detectSideEffect', () => {
  it('should detect Edit as side effect', () => {
    const result = detectSideEffect('Edit', { file_path: '/src/foo.ts', old_string: 'a', new_string: 'b' });
    expect(result.hasSideEffect).toBe(true);
    expect(result.paths).toContain('/src/foo.ts');
  });

  it('should detect Write as side effect', () => {
    const result = detectSideEffect('Write', { file_path: '/src/bar.ts', content: 'hello' });
    expect(result.hasSideEffect).toBe(true);
    expect(result.paths).toContain('/src/bar.ts');
  });

  it('should not detect Read as side effect', () => {
    const result = detectSideEffect('Read', { file_path: '/src/foo.ts' });
    expect(result.hasSideEffect).toBe(false);
  });

  it('should detect destructive Bash commands', () => {
    const result = detectSideEffect('Bash', { command: 'rm -rf dist/' });
    expect(result.hasSideEffect).toBe(true);
  });

  it('should detect git mutations', () => {
    const result = detectSideEffect('Bash', { command: 'git commit -m "fix"' });
    expect(result.hasSideEffect).toBe(true);
  });

  it('should not detect safe Bash commands', () => {
    const result = detectSideEffect('Bash', { command: 'ls -la' });
    expect(result.hasSideEffect).toBe(false);
  });
});

describe('SideEffectStore', () => {
  it('should record and retrieve artifacts', () => {
    const store = new SideEffectStore('/project');
    store.record({ id: 'a1', type: 'file', location: 'src/foo.ts', state: 'created', createdAt: Date.now() });
    const artifact = store.get('src/foo.ts');
    expect(artifact).not.toBeNull();
    expect(artifact!.state).toBe('created');
  });

  it('should update artifacts with snapshots', () => {
    const store = new SideEffectStore('/project');
    store.record({ id: 'a1', type: 'file', location: 'src/foo.ts', state: 'created', createdAt: Date.now() });
    store.update('src/foo.ts', { state: 'modified' });
    const artifact = store.get('src/foo.ts');
    expect(artifact!.state).toBe('modified');
    expect(artifact!.snapshots!.length).toBe(1);
  });

  it('should normalize paths for lookup', () => {
    const store = new SideEffectStore('/project');
    store.record({ id: 'a1', type: 'file', location: 'src/Foo.ts', state: 'created', createdAt: Date.now() });
    const artifact = store.get('src/foo.ts');
    expect(artifact).not.toBeNull();
  });
});
