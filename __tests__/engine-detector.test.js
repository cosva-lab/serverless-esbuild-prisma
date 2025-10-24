const EngineDetector = require('../lib/utils/engine-detector');
const glob = require('glob');

// Mock glob module
jest.mock('glob');

describe('EngineDetector', () => {
  let mockConfig;
  let mockLogger;
  let engineDetector;

  beforeEach(() => {
    mockConfig = {
      getServicePath: jest.fn(() => '/test/service/path'),
      serverless: {
        service: {
          custom: {
            prisma: {
              engines: {}
            }
          }
        }
      }
    };
    mockLogger = {
      debug: jest.fn()
    };
    engineDetector = new EngineDetector(mockConfig, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with config and logger', () => {
      expect(engineDetector.config).toBe(mockConfig);
      expect(engineDetector.logger).toBe(mockLogger);
    });

    it('should have correct engine patterns', () => {
      expect(engineDetector.engines).toEqual([
        'libquery_engine*rhel-openssl-*.0.x.*',
        'migration-engine*',
        'migration-engine-rhel*',
        'prisma-fmt*',
        'prisma-fmt-rhel*',
        'introspection-engine*',
        'introspection-engine-rhel*',
      ]);
    });
  });

  describe('getUserEngineConfig', () => {
    it('should return user engine config', () => {
      const result = engineDetector.getUserEngineConfig();
      expect(result).toEqual({});
    });

    it('should return custom engine config', () => {
      mockConfig.serverless.service.custom.prisma.engines = {
        queryEngineLibrary: 'custom-engine.so'
      };
      const result = engineDetector.getUserEngineConfig();
      expect(result).toEqual({
        queryEngineLibrary: 'custom-engine.so'
      });
    });
  });

  describe('detectAvailableEngines', () => {
    beforeEach(() => {
      glob.sync.mockReturnValue([
        '/test/service/path/node_modules/@prisma/engines/libquery_engine.rhel-openssl-1.0.x.so.node',
        '/test/service/path/node_modules/@prisma/engines/query-engine-rhel-openssl-1.0.x',
        '/test/service/path/node_modules/@prisma/engines/migration-engine-rhel-openssl-1.0.x',
        '/test/service/path/node_modules/@prisma/engines/prisma-fmt-rhel-openssl-1.0.x',
        '/test/service/path/node_modules/@prisma/engines/introspection-engine-rhel-openssl-1.0.x'
      ]);
    });

    it('should detect all engine types', () => {
      const result = engineDetector.detectAvailableEngines();
      
      expect(result.queryEngineLibrary).toBe('libquery_engine.rhel-openssl-1.0.x.so.node');
      expect(result.queryEngineBinary).toBe('query-engine-rhel-openssl-1.0.x');
      expect(result.migrationEngine).toBe('migration-engine-rhel-openssl-1.0.x');
      expect(result.prismaFmt).toBe('prisma-fmt-rhel-openssl-1.0.x');
      expect(result.introspectionEngine).toBe('introspection-engine-rhel-openssl-1.0.x');
    });

    it('should merge user config with auto-detected engines', () => {
      mockConfig.serverless.service.custom.prisma.engines = {
        queryEngineLibrary: 'custom-query-engine.so',
        customEngine: 'custom-engine'
      };
      
      const result = engineDetector.detectAvailableEngines();
      
      expect(result.queryEngineLibrary).toBe('custom-query-engine.so');
      expect(result.customEngine).toBe('custom-engine');
      expect(result.migrationEngine).toBe('migration-engine-rhel-openssl-1.0.x');
    });

    it('should log debug information', () => {
      engineDetector.detectAvailableEngines();
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Auto-detected engines:')
      );
    });

    it('should log user overrides when provided', () => {
      mockConfig.serverless.service.custom.prisma.engines = {
        queryEngineLibrary: 'custom-engine.so'
      };
      
      engineDetector.detectAvailableEngines();
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('User overrides:')
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Final engines:')
      );
    });

    it('should handle no engines found', () => {
      glob.sync.mockReturnValue([]);
      
      const result = engineDetector.detectAvailableEngines();
      
      expect(result).toEqual({});
    });

    it('should handle duplicate engine types', () => {
      glob.sync.mockReturnValue([
        '/test/service/path/node_modules/@prisma/engines/migration-engine-rhel-openssl-1.0.x',
        '/test/service/path/node_modules/@prisma/engines/migration-engine-rhel-openssl-2.0.x'
      ]);
      
      const result = engineDetector.detectAvailableEngines();
      
      // Should only keep the first one found
      expect(result.migrationEngine).toBe('migration-engine-rhel-openssl-1.0.x');
    });
  });

  describe('getEnginePaths', () => {
    it('should return engine paths using glob', () => {
      const mockPaths = ['/path1', '/path2'];
      glob.sync.mockReturnValue(mockPaths);
      
      const result = engineDetector.getEnginePaths();
      
      expect(glob.sync).toHaveBeenCalledWith(
        '/test/service/path/node_modules/**/{libquery_engine*rhel-openssl-*.0.x.*,migration-engine*,migration-engine-rhel*,prisma-fmt*,prisma-fmt-rhel*,introspection-engine*,introspection-engine-rhel*}',
        { nodir: true }
      );
      expect(result).toBe(mockPaths);
    });
  });

  describe('getEnginesList', () => {
    it('should return engines list', () => {
      const result = engineDetector.getEnginesList();
      expect(result).toEqual(engineDetector.engines);
    });
  });

  describe('engine detection patterns', () => {
    beforeEach(() => {
      glob.sync.mockReturnValue([]);
    });

    it('should detect query engine library', () => {
      glob.sync.mockReturnValue([
        '/test/service/path/node_modules/@prisma/engines/libquery_engine.rhel-openssl-1.0.x.so.node'
      ]);
      
      const result = engineDetector.detectAvailableEngines();
      expect(result.queryEngineLibrary).toBe('libquery_engine.rhel-openssl-1.0.x.so.node');
    });

    it('should detect query engine binary', () => {
      glob.sync.mockReturnValue([
        '/test/service/path/node_modules/@prisma/engines/query-engine-rhel-openssl-1.0.x'
      ]);
      
      const result = engineDetector.detectAvailableEngines();
      expect(result.queryEngineBinary).toBe('query-engine-rhel-openssl-1.0.x');
    });

    it('should not detect query engine binary when it contains libquery_engine', () => {
      glob.sync.mockReturnValue([
        '/test/service/path/node_modules/@prisma/engines/libquery_engine-binary-rhel-openssl-1.0.x'
      ]);
      
      const result = engineDetector.detectAvailableEngines();
      expect(result.queryEngineBinary).toBeUndefined();
    });

    it('should detect migration engine', () => {
      glob.sync.mockReturnValue([
        '/test/service/path/node_modules/@prisma/engines/migration-engine-rhel-openssl-1.0.x'
      ]);
      
      const result = engineDetector.detectAvailableEngines();
      expect(result.migrationEngine).toBe('migration-engine-rhel-openssl-1.0.x');
    });

    it('should detect introspection engine', () => {
      glob.sync.mockReturnValue([
        '/test/service/path/node_modules/@prisma/engines/introspection-engine-rhel-openssl-1.0.x'
      ]);
      
      const result = engineDetector.detectAvailableEngines();
      expect(result.introspectionEngine).toBe('introspection-engine-rhel-openssl-1.0.x');
    });

    it('should detect prisma-fmt', () => {
      glob.sync.mockReturnValue([
        '/test/service/path/node_modules/@prisma/engines/prisma-fmt-rhel-openssl-1.0.x'
      ]);
      
      const result = engineDetector.detectAvailableEngines();
      expect(result.prismaFmt).toBe('prisma-fmt-rhel-openssl-1.0.x');
    });
  });
});
