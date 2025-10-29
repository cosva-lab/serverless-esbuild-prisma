// Simple integration tests that focus on core functionality
const ServerlessEsbuildPrisma = require('../lib/index').default;

describe('ServerlessEsbuildPrisma - Simple Tests', () => {
  let mockServerless;
  let mockOptions;
  let plugin;

  beforeEach(() => {
    mockServerless = {
      cli: {
        log: jest.fn()
      },
      service: {
        service: 'test-service',
        provider: {
          stage: 'dev',
          region: 'us-west-2'
        },
        custom: {
          prisma: {
            layer: false
          }
        }
      },
      config: {
        servicePath: '/test/service/path'
      }
    };

    mockOptions = {};
    plugin = new ServerlessEsbuildPrisma(mockServerless, mockOptions);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should initialize with correct properties', () => {
      expect(plugin.serverless).toBe(mockServerless);
      expect(plugin.options).toBe(mockOptions);
      expect(plugin.useLayer).toBe(false);
      expect(plugin.deployProcessed).toBe(false);
    });

    it('should define commands and hooks', () => {
      expect(plugin.commands).toBeDefined();
      expect(plugin.commands.esbuildprisma).toBeDefined();
      expect(plugin.commands.esbuildprisma.usage).toBe('Embeds the prisma schema and engine');
      
      expect(plugin.hooks).toBeDefined();
      expect(plugin.hooks['after:package:createDeploymentArtifacts']).toBeDefined();
      expect(plugin.hooks['before:deploy:deploy']).toBeDefined();
      expect(plugin.hooks['after:deploy:deploy']).toBeDefined();
      expect(plugin.hooks['before:aws:package:finalize:mergeCustomProviderResources']).toBeDefined();
    });

    it('should have config, logger, and managers initialized', () => {
      expect(plugin.config).toBeDefined();
      expect(plugin.logger).toBeDefined();
      expect(plugin.layerManager).toBeDefined();
      expect(plugin.functionManager).toBeDefined();
      expect(plugin.cloudFormationManager).toBeDefined();
    });
  });

  describe('Configuration', () => {
    it('should use layer when configured', () => {
      mockServerless.service.custom.prisma.useLayer = true;
      const layerPlugin = new ServerlessEsbuildPrisma(mockServerless, mockOptions);
      expect(layerPlugin.useLayer).toBe(true);
    });

    it('should not use layer by default', () => {
      expect(plugin.useLayer).toBe(false);
    });
  });

  describe('Hook Methods', () => {
    it('should have async hook methods', () => {
      expect(typeof plugin.onPackageFinalize).toBe('function');
      expect(typeof plugin.onBeforeDeploy).toBe('function');
      expect(typeof plugin.onAfterDeploy).toBe('function');
      expect(typeof plugin.onBeforeMergeCustomResources).toBe('function');
    });

    it('should handle onPackageFinalize without errors', async () => {
      await expect(plugin.onPackageFinalize()).resolves.not.toThrow();
    });

    it('should handle onBeforeDeploy without errors', async () => {
      await expect(plugin.onBeforeDeploy()).resolves.not.toThrow();
    });

    it('should handle onAfterDeploy without errors', async () => {
      await expect(plugin.onAfterDeploy()).resolves.not.toThrow();
    });

    it('should handle onBeforeMergeCustomResources without errors', async () => {
      await expect(plugin.onBeforeMergeCustomResources()).resolves.not.toThrow();
    });
  });
});
