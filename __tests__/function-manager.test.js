const FunctionManager = require('../lib/utils/function-manager').default;
const fs = require('fs');
const path = require('path');

// Mock fs and path modules
jest.mock('fs');
jest.mock('path');

describe('FunctionManager', () => {
  let mockServerless;
  let mockConfig;
  let mockLogger;
  let mockEngineDetector;
  let functionManager;

  beforeEach(() => {
    mockServerless = {
      service: {
        getFunction: jest.fn()
      }
    };

    mockConfig = {
      getFunctionNamesForProcess: jest.fn(() => ['function1', 'function2'])
    };

    mockLogger = {
      debug: jest.fn(),
      success: jest.fn(),
      warn: jest.fn()
    };

    mockEngineDetector = {
      detectAvailableEngines: jest.fn(() => ({
        queryEngineLibrary: 'libquery_engine.so.node',
        queryEngineBinary: 'query-engine',
        migrationEngine: 'migration-engine',
        introspectionEngine: 'introspection-engine',
        prismaFmt: 'prisma-fmt'
      })),
      getEnginePaths: jest.fn(() => [
        '/path/to/engine1',
        '/path/to/engine2'
      ])
    };

    functionManager = new FunctionManager(mockServerless, mockConfig, mockLogger);
    functionManager.engineDetector = mockEngineDetector;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(functionManager.serverless).toBe(mockServerless);
      expect(functionManager.config).toBe(mockConfig);
      expect(functionManager.logger).toBe(mockLogger);
    });
  });

  describe('updateFunctionsWithLayer', () => {
    beforeEach(() => {
      mockServerless.service.getFunction.mockImplementation((name) => ({
        handler: 'src/handler.handler',
        layers: []
      }));
    });

    it('should add layer to functions', async () => {
      await functionManager.updateFunctionsWithLayer('arn:aws:lambda:us-west-2:123456789012:layer:test-layer:1', 'Added layer');

      expect(mockConfig.getFunctionNamesForProcess).toHaveBeenCalled();
      expect(mockServerless.service.getFunction).toHaveBeenCalledWith('function1');
      expect(mockServerless.service.getFunction).toHaveBeenCalledWith('function2');
      expect(mockLogger.success).toHaveBeenCalledWith(expect.stringContaining('Added layer function1'));
      expect(mockLogger.success).toHaveBeenCalledWith(expect.stringContaining('Added layer function2'));
    });

    it('should remove existing Prisma layers before adding new one', async () => {
      const mockFunction = {
        handler: 'src/handler.handler',
        layers: ['arn:aws:lambda:us-west-2:123456789012:layer:old-prisma-layer:1', 'other-layer']
      };
      mockServerless.service.getFunction.mockReturnValue(mockFunction);

      await functionManager.updateFunctionsWithLayer('arn:aws:lambda:us-west-2:123456789012:layer:new-prisma-layer:1', 'Updated layer');

      expect(mockFunction.layers).toEqual(['other-layer', 'arn:aws:lambda:us-west-2:123456789012:layer:new-prisma-layer:1']);
    });

    it('should remove placeholders when removePlaceholders is true', async () => {
      const mockFunction = {
        handler: 'src/handler.handler',
        layers: ['prisma-layer-LATEST', 'other-layer']
      };
      mockServerless.service.getFunction.mockReturnValue(mockFunction);

      await functionManager.updateFunctionsWithLayer('arn:aws:lambda:us-west-2:123456789012:layer:new-prisma-layer:1', 'Updated layer', true);

      expect(mockFunction.layers).toEqual(['other-layer', 'arn:aws:lambda:us-west-2:123456789012:layer:new-prisma-layer:1']);
    });

    it('should not add duplicate layers', async () => {
      const mockFunction = {
        handler: 'src/handler.handler',
        layers: ['arn:aws:lambda:us-west-2:123456789012:layer:test-layer:1']
      };
      mockServerless.service.getFunction.mockReturnValue(mockFunction);

      await functionManager.updateFunctionsWithLayer('arn:aws:lambda:us-west-2:123456789012:layer:test-layer:1', 'Added layer');

      expect(mockFunction.layers).toHaveLength(1);
    });

    it('should handle invalid functions gracefully', async () => {
      mockServerless.service.getFunction.mockImplementation((name) => {
        if (name === 'function1') {
          return null;
        }
        return { handler: 'src/handler.handler', layers: [] };
      });

      await functionManager.updateFunctionsWithLayer('arn:aws:lambda:us-west-2:123456789012:layer:test-layer:1', 'Added layer');

      // Should not process function1 but should process function2
      expect(mockServerless.service.getFunction).toHaveBeenCalledWith('function1');
      expect(mockServerless.service.getFunction).toHaveBeenCalledWith('function2');
    });

    it('should handle functions without handler', async () => {
      mockServerless.service.getFunction.mockImplementation((name) => {
        if (name === 'function1') {
          return { layers: [] }; // No handler property
        }
        return { handler: 'src/handler.handler', layers: [] };
      });

      await functionManager.updateFunctionsWithLayer('arn:aws:lambda:us-west-2:123456789012:layer:test-layer:1', 'Added layer');

      // Should not process function1 but should process function2
      expect(mockServerless.service.getFunction).toHaveBeenCalledWith('function1');
      expect(mockServerless.service.getFunction).toHaveBeenCalledWith('function2');
    });
  });

  describe('setPrismaEnvironmentVariables', () => {
    it('should set all Prisma environment variables', () => {
      const mockFunction = { environment: {} };
      
      functionManager.setPrismaEnvironmentVariables(mockFunction);

      expect(mockFunction.environment.PRISMA_QUERY_ENGINE_LIBRARY).toBe('/opt/nodejs/libquery_engine.so.node');
      expect(mockFunction.environment.PRISMA_QUERY_ENGINE_BINARY).toBe('/opt/nodejs/query-engine');
      expect(mockFunction.environment.PRISMA_MIGRATION_ENGINE_BINARY).toBe('/opt/nodejs/migration-engine');
      expect(mockFunction.environment.PRISMA_INTROSPECTION_ENGINE_BINARY).toBe('/opt/nodejs/introspection-engine');
      expect(mockFunction.environment.PRISMA_FMT_BINARY).toBe('/opt/nodejs/prisma-fmt');
    });

    it('should initialize environment object if not exists', () => {
      const mockFunction = {};
      
      functionManager.setPrismaEnvironmentVariables(mockFunction);

      expect(mockFunction.environment).toBeDefined();
      expect(mockFunction.environment.PRISMA_QUERY_ENGINE_LIBRARY).toBe('/opt/nodejs/libquery_engine.so.node');
    });

    it('should only set available engines', () => {
      mockEngineDetector.detectAvailableEngines.mockReturnValue({
        queryEngineLibrary: 'libquery_engine.so.node'
        // Other engines not available
      });

      const mockFunction = { environment: {} };
      
      functionManager.setPrismaEnvironmentVariables(mockFunction);

      expect(mockFunction.environment.PRISMA_QUERY_ENGINE_LIBRARY).toBe('/opt/nodejs/libquery_engine.so.node');
      expect(mockFunction.environment.PRISMA_QUERY_ENGINE_BINARY).toBeUndefined();
      expect(mockFunction.environment.PRISMA_MIGRATION_ENGINE_BINARY).toBeUndefined();
    });

    it('should log debug information for each engine', () => {
      const mockFunction = { environment: {} };
      
      functionManager.setPrismaEnvironmentVariables(mockFunction);

      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Set query engine library'));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Set query engine binary'));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Set migration engine'));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Set introspection engine'));
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Set prisma-fmt'));
    });
  });

  describe('writePrismaSchemaAndEngineToZip', () => {
    it('should call writeToZip with includeEngines true', () => {
      functionManager.writeToZip = jest.fn();
      
      functionManager.writePrismaSchemaAndEngineToZip('function1', { prismaSchema: '/path/to/schema.prisma' });

      expect(functionManager.writeToZip).toHaveBeenCalledWith('function1', '/path/to/schema.prisma', true);
    });
  });

  describe('writePrismaSchemaToZip', () => {
    it('should call writeToZip with includeEngines false', () => {
      functionManager.writeToZip = jest.fn();
      
      functionManager.writePrismaSchemaToZip('function1', { prismaSchema: '/path/to/schema.prisma' });

      expect(functionManager.writeToZip).toHaveBeenCalledWith('function1', '/path/to/schema.prisma', false);
    });
  });

  describe('writeToZip', () => {
    beforeEach(() => {
      // Reset all mocks
      jest.clearAllMocks();
      
      fs.readFileSync.mockImplementation((filePath) => {
        if (filePath.includes('schema')) {
          return Buffer.from('schema content');
        }
        if (filePath.includes('engine')) {
          return Buffer.from('engine content');
        }
        return Buffer.from('zip content');
      });
      fs.writeFileSync = jest.fn();
    });

    it('should write schema to zip file', () => {
      const mockZip = {
        addFile: jest.fn(),
        writeZip: jest.fn()
      };
      const AdmZip = require('adm-zip');
      AdmZip.mockImplementation(() => mockZip);

      mockServerless.service.getFunction.mockReturnValue({
        handler: 'src/handler.handler'
      });

      // Mock the existing zip file read
      fs.readFileSync.mockImplementation((filePath) => {
        if (filePath === './.serverless/function1.zip') {
          return Buffer.from('existing zip content');
        }
        if (filePath.includes('schema')) {
          return Buffer.from('schema content');
        }
        return Buffer.from('other content');
      });

      functionManager.writeToZip('function1', '/path/to/schema.prisma', false);

      expect(fs.readFileSync).toHaveBeenCalled();
      expect(mockZip.addFile).toHaveBeenCalled();
      expect(mockZip.writeZip).toHaveBeenCalled();
    });

    it('should write engines to zip when includeEngines is true', () => {
      const mockZip = {
        addFile: jest.fn(),
        writeZip: jest.fn()
      };
      const AdmZip = require('adm-zip');
      AdmZip.mockImplementation(() => mockZip);

      mockServerless.service.getFunction.mockReturnValue({
        handler: 'src/handler.handler'
      });

      // Mock the existing zip file read
      fs.readFileSync.mockImplementation((filePath) => {
        if (filePath === './.serverless/function1.zip') {
          return Buffer.from('existing zip content');
        }
        if (filePath.includes('schema')) {
          return Buffer.from('schema content');
        }
        if (filePath.includes('engine')) {
          return Buffer.from('engine content');
        }
        return Buffer.from('other content');
      });

      functionManager.writeToZip('function1', '/path/to/schema.prisma', true);

      expect(fs.readFileSync).toHaveBeenCalled();
      expect(mockZip.addFile).toHaveBeenCalled();
      expect(mockZip.writeZip).toHaveBeenCalled();
    });

    it('should handle invalid function gracefully', () => {
      mockServerless.service.getFunction.mockReturnValue(null);

      functionManager.writeToZip('function1', '/path/to/schema.prisma', false);

      // Should return early without processing
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('should handle function without handler', () => {
      mockServerless.service.getFunction.mockReturnValue({});

      functionManager.writeToZip('function1', '/path/to/schema.prisma', false);

      // Should return early without processing
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('should handle errors during zip operations', () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      mockServerless.service.getFunction.mockReturnValue({
        handler: 'src/handler.handler'
      });

      functionManager.writeToZip('function1', '/path/to/schema.prisma', false);

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Error writing to zip for function function1'));
    });
  });
});
