import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'rtvs.log');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function fmt(level: string, message: string): string {
  return `[${new Date().toISOString()}] [${level}] ${message}`;
}

export const logger = {
  info(message: string): void {
    logStream.write(fmt('INFO', message) + '\n');
  },
  warn(message: string): void {
    const line = fmt('WARN', message);
    logStream.write(line + '\n');
    console.warn(line);
  },
  error(message: string, err?: unknown): void {
    const errStr = err != null ? ` ${String(err)}` : '';
    const line = fmt('ERROR', message + errStr);
    logStream.write(line + '\n');
    console.error(line);
  },
};
