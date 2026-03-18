import fs from 'fs';
import path from 'path';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

const ensureLogDir = () => {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
};

const getLogFileName = () => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(LOG_DIR, `${date}.log`);
};

const formatTimestamp = () => {
  const now = new Date();
  return now.toISOString().replace('T', ' ').slice(0, 19);
};

const writeLog = (level: LogLevel, tag: string, message: string, meta?: Record<string, unknown>) => {
  if (LOG_LEVELS[level] < LOG_LEVELS[MIN_LEVEL]) return;

  const timestamp = formatTimestamp();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  const line = `[${timestamp}] [${level.toUpperCase()}] [${tag}] ${message}${metaStr}\n`;

  // console 출력 (기존 호환)
  const consoleFn = level === 'error' ? console.error : console.log;
  consoleFn(`[${tag}] ${message}${metaStr}`);

  // 파일 저장
  try {
    ensureLogDir();
    fs.appendFileSync(getLogFileName(), line);
  } catch {}
};

export const createLogger = (tag: string) => ({
  debug: (message: string, meta?: Record<string, unknown>) => writeLog('debug', tag, message, meta),
  info: (message: string, meta?: Record<string, unknown>) => writeLog('info', tag, message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => writeLog('warn', tag, message, meta),
  error: (message: string, meta?: Record<string, unknown>) => writeLog('error', tag, message, meta),
});

export type Logger = ReturnType<typeof createLogger>;
