import { describe, it, expect } from 'vitest';
import { SideEffectStoreImpl } from '../../src/side-effects/store.js';

describe('SideEffectStore', () => {
  it('should record a new artifact', () => {
    const store = new SideEffectStoreImpl('/project');
    store.record({
      id: 'a1',
      location: '/project/src/file.ts',
      snapshots: [],
      currentState: 'content v1',
    });
    const artifact = store.get('/project/src/file.ts');
    expect(artifact).not.toBeNull();
    expect(artifact!.currentState).toBe('content v1');
  });

  it('should normalize paths when recording and getting', () => {
    const store = new SideEffectStoreImpl('/project');
    store.record({
      id: 'a1',
      location: '/Project/Src/File.ts',
      snapshots: [],
      currentState: 'v1',
    });
    const artifact = store.get('/project/src/file.ts');
    expect(artifact).not.toBeNull();
  });

  it('should update existing artifact and add snapshot', () => {
    const store = new SideEffectStoreImpl('/project');
    store.record({
      id: 'a1',
      location: '/project/file.ts',
      snapshots: [],
      currentState: 'v1',
    });
    store.update('/project/file.ts', 'v2', 'frame-2', 2000);
    const artifact = store.get('/project/file.ts');
    expect(artifact!.currentState).toBe('v2');
    expect(artifact!.snapshots).toHaveLength(1);
    expect(artifact!.snapshots[0].state).toBe('v1');
    expect(artifact!.snapshots[0].frameId).toBe('frame-2');
  });

  it('should return null for unknown artifacts', () => {
    const store = new SideEffectStoreImpl('/project');
    expect(store.get('/nonexistent')).toBeNull();
  });

  it('should list all artifacts', () => {
    const store = new SideEffectStoreImpl('/project');
    store.record({ id: 'a1', location: '/project/a.ts', snapshots: [], currentState: 'a' });
    store.record({ id: 'a2', location: '/project/b.ts', snapshots: [], currentState: 'b' });
    expect(store.all()).toHaveLength(2);
  });
});
