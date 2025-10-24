const ConfigManager = require('../lib/config');

describe('ConfigManager', () => {
  let mockServerless;
  let configManager;

  beforeEach(() => {
    mockServerless = {
      service: {
        provider: {
          region: 'us-west-2',
          stage: 'dev',
          runtime: 'nodejs18.x'
        },
        service: 'test-service',
        getAllFunctions: jest.fn(() => ['function1', 'function2', 'function3']),
        getFunction: jest.fn()
      },
      config: {
        servicePath: '/test/service/path'
      },
      configurationInput: {
        package: {
          individually: false
        }
      }
    };
    configManager = new ConfigManager(mockServerless);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with serverless instance', () => {
      expect(configManager.serverless).toBe(mockServerless);
    });
  });

  describe('getRegion', () => {
    it('should return configured region', () => {
      expect(configManager.getRegion()).toBe('us-west-2');
    });

    it('should return default region when not configured', () => {
      delete mockServerless.service.provider.region;
      expect(configManager.getRegion()).toBe('us-east-1');
    });
  });

  describe('getServicePath', () => {
    it('should return service path from config', () => {
      expect(configManager.getServicePath()).toBe('/test/service/path');
    });
  });

  describe('getLayerConfig', () => {
    it('should return false by default', () => {
      expect(configManager.getLayerConfig()).toBe(false);
    });

    it('should return configured layer setting', () => {
      mockServerless.service.custom = {
        prisma: {
          useLayer: true
        }
      };
      expect(configManager.getLayerConfig()).toBe(true);
    });
  });

  describe('getLayerName', () => {
    it('should return default layer name with stage', () => {
      expect(configManager.getLayerName()).toBe('test-service-dev-prisma-layer');
    });

    it('should return custom layer name when configured', () => {
      mockServerless.service.custom = {
        prisma: {
          layerName: 'custom-layer-name'
        }
      };
      expect(configManager.getLayerName()).toBe('custom-layer-name');
    });

    it('should use default stage when not configured', () => {
      delete mockServerless.service.provider.stage;
      expect(configManager.getLayerName()).toBe('test-service-dev-prisma-layer');
    });
  });

  describe('getLayerDescription', () => {
    it('should return default description', () => {
      expect(configManager.getLayerDescription()).toBe('Prisma engines layer for serverless functions');
    });

    it('should return custom description when configured', () => {
      mockServerless.service.custom = {
        prisma: {
          layerDescription: 'Custom layer description'
        }
      };
      expect(configManager.getLayerDescription()).toBe('Custom layer description');
    });
  });

  describe('getPrismaPath', () => {
    it('should return service path by default', () => {
      expect(configManager.getPrismaPath()).toBe('/test/service/path');
    });

    it('should return custom prisma path when configured', () => {
      mockServerless.service.custom = {
        prisma: {
          prismaPath: '/custom/prisma/path'
        }
      };
      expect(configManager.getPrismaPath()).toBe('/custom/prisma/path');
    });
  });

  describe('getIgnoredFunctionNames', () => {
    it('should return empty array by default', () => {
      expect(configManager.getIgnoredFunctionNames()).toEqual([]);
    });

    it('should return configured ignored functions', () => {
      mockServerless.service.custom = {
        prisma: {
          ignoreFunctions: ['function1', 'function2']
        }
      };
      expect(configManager.getIgnoredFunctionNames()).toEqual(['function1', 'function2']);
    });
  });

  describe('getEsbuildOutputPath', () => {
    it('should return service path by default', () => {
      expect(configManager.getEsbuildOutputPath()).toBe('/test/service/path');
    });

    it('should return custom esbuild output path when configured', () => {
      mockServerless.service.custom = {
        esbuild: {
          outputDir: '/custom/output/path'
        }
      };
      expect(configManager.getEsbuildOutputPath()).toBe('/custom/output/path');
    });
  });

  describe('getFunctionNamesForProcess', () => {
    it('should return service when not packaging individually', () => {
      expect(configManager.getFunctionNamesForProcess()).toEqual(['service']);
    });

    it('should return all node functions when packaging individually', () => {
      mockServerless.configurationInput.package.individually = true;
      mockServerless.service.getFunction.mockImplementation((name) => ({
        runtime: 'nodejs18.x'
      }));
      expect(configManager.getFunctionNamesForProcess()).toEqual(['function1', 'function2', 'function3']);
    });
  });

  describe('getAllNodeFunctions', () => {
    beforeEach(() => {
      mockServerless.configurationInput.package.individually = true;
    });

    it('should return all node functions', () => {
      mockServerless.service.getFunction.mockImplementation((name) => ({
        runtime: 'nodejs18.x'
      }));
      const result = configManager.getAllNodeFunctions();
      expect(result).toEqual(['function1', 'function2', 'function3']);
    });

    it('should filter out ignored functions', () => {
      mockServerless.service.custom = {
        prisma: {
          ignoreFunctions: ['function2']
        }
      };
      mockServerless.service.getFunction.mockImplementation((name) => ({
        runtime: 'nodejs18.x'
      }));
      const result = configManager.getAllNodeFunctions();
      expect(result).toEqual(['function1', 'function3']);
    });

    it('should filter out non-node functions', () => {
      mockServerless.service.getFunction.mockImplementation((name) => ({
        runtime: name === 'function2' ? 'python3.9' : 'nodejs18.x'
      }));
      const result = configManager.getAllNodeFunctions();
      expect(result).toEqual(['function1', 'function3']);
    });

    it('should filter out image functions', () => {
      mockServerless.service.getFunction.mockImplementation((name) => ({
        runtime: 'nodejs18.x',
        image: name === 'function2' ? 'some-image' : undefined
      }));
      const result = configManager.getAllNodeFunctions();
      expect(result).toEqual(['function1', 'function3']);
    });

    it('should handle invalid functions gracefully', () => {
      mockServerless.service.getFunction.mockImplementation((name) => {
        if (name === 'function2') {
          throw new Error('Function not found');
        }
        return { runtime: 'nodejs18.x' };
      });
      const result = configManager.getAllNodeFunctions();
      expect(result).toEqual(['function1', 'function3']);
    });

    it('should handle null functions gracefully', () => {
      mockServerless.service.getFunction.mockImplementation((name) => {
        if (name === 'function2') {
          return null;
        }
        return { runtime: 'nodejs18.x' };
      });
      const result = configManager.getAllNodeFunctions();
      expect(result).toEqual(['function1', 'function3']);
    });
  });

  describe('isNodeRuntime', () => {
    it('should return true for node runtimes', () => {
      expect(configManager.isNodeRuntime('nodejs18.x')).toBeTruthy();
      expect(configManager.isNodeRuntime('nodejs16.x')).toBeTruthy();
      expect(configManager.isNodeRuntime('nodejs14.x')).toBeTruthy();
    });

    it('should return false for non-node runtimes', () => {
      expect(configManager.isNodeRuntime('python3.9')).toBeFalsy();
      expect(configManager.isNodeRuntime('java11')).toBeFalsy();
      expect(configManager.isNodeRuntime('go1.x')).toBeFalsy();
    });
  });

  describe('getLoggingConfig', () => {
    it('should return default logging config', () => {
      expect(configManager.getLoggingConfig()).toBe('INFO');
    });

    it('should return custom logging config', () => {
      mockServerless.service.custom = {
        prisma: {
          logging: 'DEBUG'
        }
      };
      expect(configManager.getLoggingConfig()).toBe('DEBUG');
    });
  });

  describe('getDebugConfig', () => {
    it('should return false by default', () => {
      expect(configManager.getDebugConfig()).toBe(false);
    });

    it('should return custom debug config', () => {
      mockServerless.service.custom = {
        prisma: {
          debug: true
        }
      };
      expect(configManager.getDebugConfig()).toBe(true);
    });
  });
});
