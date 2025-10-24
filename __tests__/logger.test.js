const Logger = require('../lib/logger');

describe('Logger', () => {
  let mockServerless;
  let logger;

  beforeEach(() => {
    mockServerless = {
      cli: {
        log: jest.fn()
      },
      service: {
        custom: {
          prisma: {
            logging: 'INFO'
          }
        }
      }
    };
    logger = new Logger(mockServerless);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(logger.serverless).toBe(mockServerless);
      expect(logger.pluginName).toBe('serverless-esbuild-prisma');
      expect(logger.prefix).toBe('(serverless-esbuild-prisma)');
      expect(logger.logLevel).toBe('INFO');
    });

    it('should set default log level when no config provided', () => {
      const serverlessWithoutConfig = {
        cli: { log: jest.fn() },
        service: { custom: {} }
      };
      const loggerWithoutConfig = new Logger(serverlessWithoutConfig);
      expect(loggerWithoutConfig.logLevel).toBe('INFO');
    });

    it('should handle string logging config', () => {
      mockServerless.service.custom.prisma.logging = 'DEBUG';
      const debugLogger = new Logger(mockServerless);
      expect(debugLogger.logLevel).toBe('DEBUG');
    });

    it('should handle object logging config', () => {
      mockServerless.service.custom.prisma.logging = { level: 'WARN' };
      const warnLogger = new Logger(mockServerless);
      expect(warnLogger.logLevel).toBe('WARN');
    });
  });

  describe('getLogLevel', () => {
    it('should return string config as uppercase', () => {
      mockServerless.service.custom.prisma.logging = 'debug';
      const result = logger.getLogLevel();
      expect(result).toBe('DEBUG');
    });

    it('should return object config level as uppercase', () => {
      mockServerless.service.custom.prisma.logging = { level: 'warn' };
      const result = logger.getLogLevel();
      expect(result).toBe('WARN');
    });

    it('should return default INFO when no config', () => {
      mockServerless.service.custom = {};
      const result = logger.getLogLevel();
      expect(result).toBe('INFO');
    });
  });

  describe('shouldLog', () => {
    it('should return true for lower or equal level', () => {
      logger.logLevel = 'INFO';
      expect(logger.shouldLog('INFO')).toBe(true);
      expect(logger.shouldLog('ERROR')).toBe(true);
      expect(logger.shouldLog('WARN')).toBe(true);
    });

    it('should return false for higher level', () => {
      logger.logLevel = 'WARN';
      expect(logger.shouldLog('INFO')).toBe(false);
      expect(logger.shouldLog('DEBUG')).toBe(false);
    });

    it('should handle unknown levels gracefully', () => {
      expect(logger.shouldLog('UNKNOWN')).toBe(true); // defaults to INFO level
    });
  });

  describe('formatMessage', () => {
    it('should format message with timestamp and level', () => {
      const result = logger.formatMessage('INFO', 'Test message');
      expect(result).toMatch(/\(serverless-esbuild-prisma\) \[.*\] \[INFO\] Test message/);
    });
  });

  describe('log methods', () => {
    beforeEach(() => {
      logger.logLevel = 'DEBUG'; // Enable all logging
    });

    it('should call serverless.cli.log for info', () => {
      logger.info('Test info message');
      expect(mockServerless.cli.log).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] Test info message')
      );
    });

    it('should call serverless.cli.log for warn', () => {
      logger.warn('Test warn message');
      expect(mockServerless.cli.log).toHaveBeenCalledWith(
        expect.stringContaining('[WARN] Test warn message')
      );
    });

    it('should call serverless.cli.log for error', () => {
      logger.error('Test error message');
      expect(mockServerless.cli.log).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] Test error message')
      );
    });

    it('should call serverless.cli.log for success', () => {
      logger.success('Test success message');
      expect(mockServerless.cli.log).toHaveBeenCalledWith(
        expect.stringContaining('[SUCCESS] Test success message')
      );
    });

    it('should call serverless.cli.log for debug', () => {
      logger.debug('Test debug message');
      expect(mockServerless.cli.log).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] Test debug message')
      );
    });

    it('should not log when level is disabled', () => {
      // Clear any previous calls
      mockServerless.cli.log.mockClear();
      
      // Create a new logger with ERROR level
      const errorLogger = new Logger({
        service: {
          custom: {
            prisma: {
              logging: 'ERROR'
            }
          }
        },
        cli: {
          log: jest.fn()
        }
      });
      
      errorLogger.info('This should not log');
      // The logger should not call cli.log for INFO when level is ERROR
      expect(mockServerless.cli.log).not.toHaveBeenCalled();
    });
  });

  describe('logWithLevel', () => {
    it('should log with custom level', () => {
      logger.logLevel = 'DEBUG';
      logger.logWithLevel('CUSTOM', 'Custom message');
      expect(mockServerless.cli.log).toHaveBeenCalledWith(
        expect.stringContaining('[CUSTOM] Custom message')
      );
    });
  });

  describe('isLevelEnabled', () => {
    it('should return true when level is enabled', () => {
      logger.logLevel = 'INFO';
      expect(logger.isLevelEnabled('INFO')).toBe(true);
      expect(logger.isLevelEnabled('ERROR')).toBe(true);
    });

    it('should return false when level is disabled', () => {
      logger.logLevel = 'WARN';
      expect(logger.isLevelEnabled('INFO')).toBe(false);
      expect(logger.isLevelEnabled('DEBUG')).toBe(false);
    });
  });
});
