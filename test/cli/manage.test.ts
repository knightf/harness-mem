import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ink', () => ({
  render: vi.fn(() => ({ waitUntilExit: () => Promise.resolve() })),
}));

vi.mock('react', () => ({
  default: { createElement: vi.fn(() => ({})) },
  createElement: vi.fn(() => ({})),
}));

vi.mock('../../src/tui/App.js', () => ({
  App: vi.fn(),
}));

describe('launchManage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call ink render with App component and digestDir + cwd props', async () => {
    const { launchManage } = await import('../../src/tui/manage.js');
    const { render } = await import('ink');
    const React = (await import('react')).default;

    await launchManage({ digestDir: '/tmp/test-digests', cwd: '/work/proj-a' });

    expect(React.createElement).toHaveBeenCalledWith(
      expect.any(Function),
      { digestDir: '/tmp/test-digests', cwd: '/work/proj-a' },
    );
    expect(render).toHaveBeenCalled();
  });
});
