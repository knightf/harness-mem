import pino from 'pino';
import path from 'path';
import os from 'os';
import fs from 'fs';

const DEFAULT_LOG_DIR = path.join(os.homedir(), '.harness-mem');
const LOG_FILENAME = 'harness-mem.log';

export function createLogger(configDir?: string): pino.Logger {
  const logDir = configDir ?? DEFAULT_LOG_DIR;
  fs.mkdirSync(logDir, { recursive: true });

  const logPath = path.join(logDir, LOG_FILENAME);
  const dest = pino.destination({ dest: logPath, sync: false });

  return pino({ level: 'trace' }, dest);
}
