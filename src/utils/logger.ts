import { ServerlessInstance } from '../types';

type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'SUCCESS' | 'DEBUG';

class Logger {
  private serverless: ServerlessInstance;
  private pluginName: string;
  private prefix: string;
  private logLevel: LogLevel;
  private logLevels: Record<LogLevel, number>;

  constructor(serverless: ServerlessInstance) {
    this.serverless = serverless;
    this.pluginName = 'serverless-esbuild-prisma';
    this.prefix = `(${this.pluginName})`;

    // Configure log levels
    this.logLevel = this.getLogLevel();
    this.logLevels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      SUCCESS: 3,
      DEBUG: 4,
    };
  }

  getLogLevel(): LogLevel {
    const config = this.serverless.service.custom?.prisma?.logging;

    if (typeof config === 'string') {
      const level = config.toUpperCase() as LogLevel;
      return ['ERROR', 'WARN', 'INFO', 'SUCCESS', 'DEBUG'].includes(
        level,
      )
        ? level
        : 'INFO';
    }

    if (typeof config === 'object' && config.level) {
      const level = config.level.toUpperCase() as LogLevel;
      return ['ERROR', 'WARN', 'INFO', 'SUCCESS', 'DEBUG'].includes(
        level,
      )
        ? level
        : 'INFO';
    }

    // Default to INFO level
    return 'INFO';
  }

  shouldLog(level: LogLevel): boolean {
    const currentLevel =
      this.logLevels[this.logLevel] || this.logLevels.INFO;
    const messageLevel = this.logLevels[level] || this.logLevels.INFO;
    return messageLevel <= currentLevel;
  }

  formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `${this.prefix} [${timestamp}] [${level}] ${message}`;
  }

  log(message: string, ...args: (string | undefined)[]): void {
    if (this.shouldLog('INFO')) {
      this.serverless.cli.log(`${this.prefix} ${message}`, ...args);
    }
  }

  info(message: string, ...args: (string | undefined)[]): void {
    if (this.shouldLog('INFO')) {
      this.serverless.cli.log(
        this.formatMessage('INFO', message),
        ...args,
      );
    }
  }

  warn(message: string, ...args: (string | undefined)[]): void {
    if (this.shouldLog('WARN')) {
      this.serverless.cli.log(
        this.formatMessage('WARN', message),
        ...args,
      );
    }
  }

  error(message: string, ...args: (string | undefined)[]): void {
    if (this.shouldLog('ERROR')) {
      this.serverless.cli.log(
        this.formatMessage('ERROR', message),
        ...args,
      );
    }
  }

  success(message: string, ...args: (string | undefined)[]): void {
    if (this.shouldLog('SUCCESS')) {
      this.serverless.cli.log(
        this.formatMessage('SUCCESS', message),
        ...args,
      );
    }
  }

  debug(message: string, ...args: (string | undefined)[]): void {
    if (this.shouldLog('DEBUG')) {
      this.serverless.cli.log(
        this.formatMessage('DEBUG', message),
        ...args,
      );
    }
  }

  // New method to log with custom level
  logWithLevel(
    level: LogLevel,
    message: string,
    ...args: (string | undefined)[]
  ): void {
    if (this.shouldLog(level)) {
      this.serverless.cli.log(
        this.formatMessage(level, message),
        ...args,
      );
    }
  }

  // Method to check if a specific level is enabled
  isLevelEnabled(level: LogLevel): boolean {
    return this.shouldLog(level);
  }
}

export default Logger;
