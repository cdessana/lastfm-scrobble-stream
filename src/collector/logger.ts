/**
 * Structured Logger for Last.fm Collector & Kafka Producer
 * Emits uniform JSON or structured console logs for ingestion by observability stacks.
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogContext {
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40
};

const CURRENT_LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL?.toUpperCase() as LogLevel) || 'INFO';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= (LOG_LEVELS[CURRENT_LOG_LEVEL] || 20);
}

function formatLog(level: LogLevel, message: string, context?: LogContext) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    component: 'lastfm-kafka-collector',
    ...context
  };

  const output = JSON.stringify(entry);

  if (level === 'ERROR') {
    console.error(output);
  } else if (level === 'WARN') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => {
    if (shouldLog('DEBUG')) formatLog('DEBUG', message, context);
  },
  info: (message: string, context?: LogContext) => {
    if (shouldLog('INFO')) formatLog('INFO', message, context);
  },
  warn: (message: string, context?: LogContext) => {
    if (shouldLog('WARN')) formatLog('WARN', message, context);
  },
  error: (message: string, context?: LogContext) => {
    if (shouldLog('ERROR')) formatLog('ERROR', message, context);
  }
};
