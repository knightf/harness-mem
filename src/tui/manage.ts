import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

// ─── launchManage ────────────────────────────────────────────────────────────

export interface ManageOptions {
  digestDir: string;
  cwd: string;
}

export async function launchManage(options: ManageOptions): Promise<void> {
  const { waitUntilExit } = render(
    React.createElement(App, { digestDir: options.digestDir, cwd: options.cwd }),
  );
  await waitUntilExit();
}
