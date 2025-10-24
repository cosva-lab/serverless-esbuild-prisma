class Logger {
  constructor(serverless) {
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
      DEBUG: 4
    };
  }

  getLogLevel() {
    const config = this.serverless.service.custom?.prisma?.logging;
    
    if (typeof config === 'string') {
      return config.toUpperCase();
    }
    
    if (typeof config === 'object' && config.level) {
      return config.level.toUpperCase();
    }
    
    // Default to INFO level
    return 'INFO';
  }

  shouldLog(level) {
    const currentLevel = this.logLevels[this.logLevel] || this.logLevels.INFO;
    const messageLevel = this.logLevels[level] || this.logLevels.INFO;
    return messageLevel <= currentLevel;
  }

  formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString();
    return `${this.prefix} [${timestamp}] [${level}] ${message}`;
  }

  log(message, ...args) {
    if (this.shouldLog('INFO')) {
      this.serverless.cli.log(`${this.prefix} ${message}`, ...args);
    }
  }

  info(message, ...args) {
    if (this.shouldLog('INFO')) {
      this.serverless.cli.log(this.formatMessage('INFO', message), ...args);
    }
  }

  warn(message, ...args) {
    if (this.shouldLog('WARN')) {
      this.serverless.cli.log(this.formatMessage('WARN', message), ...args);
    }
  }

  error(message, ...args) {
    if (this.shouldLog('ERROR')) {
      this.serverless.cli.log(this.formatMessage('ERROR', message), ...args);
    }
  }

  success(message, ...args) {
    if (this.shouldLog('SUCCESS')) {
      this.serverless.cli.log(this.formatMessage('SUCCESS', message), ...args);
    }
  }

  debug(message, ...args) {
    if (this.shouldLog('DEBUG')) {
      this.serverless.cli.log(this.formatMessage('DEBUG', message), ...args);
    }
  }

  // New method to log with custom level
  logWithLevel(level, message, ...args) {
    if (this.shouldLog(level)) {
      this.serverless.cli.log(this.formatMessage(level, message), ...args);
    }
  }

  // Method to check if a specific level is enabled
  isLevelEnabled(level) {
    return this.shouldLog(level);
  }
}

module.exports = Logger;
