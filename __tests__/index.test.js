const ServerlessEsbuildPrisma = require('../lib/index').default;
const { getSchemaWithPath } = require('@prisma/internals');

// Mock the dependencies
jest.mock('@prisma/internals');
jest.mock('../lib/utils/logger');
jest.mock('../lib/utils/config');
jest.mock('../lib/utils/layer-manager');
jest.mock('../lib/utils/function-manager');
jest.mock('../lib/utils/cloudformation-manager');

const Logger = require('../lib/utils/logger').default;
const ConfigManager = require('../lib/utils/config').default;
const LayerManager = require('../lib/utils/layer-manager').default;
const FunctionManager =
  require('../lib/utils/function-manager').default;
const CloudFormationManager =
  require('../lib/utils/cloudformation-manager').default;

describe('ServerlessEsbuildPrisma', () => {
  let mockServerless;
  let mockOptions;
  let plugin;
  let mockConfig;
  let mockLogger;
  let mockLayerManager;
  let mockFunctionManager;
  let mockCloudFormationManager;

  beforeEach(() => {
    mockServerless = {
      cli: {
        log: jest.fn(),
      },
      service: {
        service: 'test-service',
        provider: {
          stage: 'dev',
        },
        getFunction: jest.fn(),
      },
    };

    mockOptions = {};

    // Mock the managers
    mockConfig = {
      getUseLayer: jest.fn(() => false),
      getFunctionNamesForProcess: jest.fn(() => [
        'function1',
        'function2',
      ]),
      getLayerName: jest.fn(() => 'test-layer'),
      getRegion: jest.fn(() => 'us-west-2'),
    };

    mockLogger = {
      info: jest.fn(),
      success: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    mockLayerManager = {
      createLayerZip: jest.fn(() =>
        Promise.resolve('/path/to/layer.zip'),
      ),
      handleLayerDeploymentFromZip: jest.fn(),
      getLatestLayerArn: jest.fn(() =>
        Promise.resolve(
          'arn:aws:lambda:us-west-2:123456789012:layer:test-layer:1',
        ),
      ),
      getAccountId: jest.fn(() => Promise.resolve('123456789012')),
    };

    mockFunctionManager = {
      writePrismaSchemaToZip: jest.fn(),
      writePrismaSchemaAndEngineToZip: jest.fn(),
      updateFunctionsWithLayer: jest.fn(),
      setPrismaEnvironmentVariables: jest.fn(),
    };

    mockCloudFormationManager = {
      removeLayersFromTemplate: jest.fn(),
      addLayersToTemplate: jest.fn(),
      updateLayersInTemplate: jest.fn(),
    };

    // Mock the constructors
    ConfigManager.mockImplementation(() => mockConfig);
    Logger.mockImplementation(() => mockLogger);
    LayerManager.mockImplementation(() => mockLayerManager);
    FunctionManager.mockImplementation(() => mockFunctionManager);
    CloudFormationManager.mockImplementation(
      () => mockCloudFormationManager,
    );

    getSchemaWithPath.mockResolvedValue({
      schemaPath: '/path/to/schema.prisma',
    });

    plugin = new ServerlessEsbuildPrisma(mockServerless, mockOptions);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(plugin.serverless).toBe(mockServerless);
      expect(plugin.options).toBe(mockOptions);
      expect(plugin.config).toBe(mockConfig);
      expect(plugin.logger).toBe(mockLogger);
      expect(plugin.layerManager).toBe(mockLayerManager);
      expect(plugin.functionManager).toBe(mockFunctionManager);
      expect(plugin.cloudFormationManager).toBe(
        mockCloudFormationManager,
      );
    });

    it('should set useLayer from config', () => {
      expect(plugin.useLayer).toBe(false);
    });

    it('should initialize deployProcessed as false', () => {
      expect(plugin.deployProcessed).toBe(false);
    });

    it('should define commands', () => {
      expect(plugin.commands).toStrictEqual({
        esbuildprisma: {
          usage: 'Embeds the prisma schema and engine',
          lifecycleEvents: ['package'],
        },
      });
    });

    it('should define hooks', () => {
      expect(plugin.hooks).toBeDefined();
      expect(
        plugin.hooks['before:package:createDeploymentArtifacts'],
      ).toBeDefined();
      expect(
        plugin.hooks['after:package:createDeploymentArtifacts'],
      ).toBeDefined();
      expect(plugin.hooks['before:deploy:deploy']).toBeDefined();
      expect(plugin.hooks['after:deploy:deploy']).toBeDefined();
      expect(
        plugin.hooks[
          'before:aws:package:finalize:mergeCustomProviderResources'
        ],
      ).toBeDefined();
    });
  });

  describe('onBeforePackage', () => {
    it('should set Prisma environment variables for all functions when useLayer is true', async () => {
      // Reset the plugin to get fresh config with useLayer = true
      mockConfig.getUseLayer.mockReturnValue(true);

      const layerPlugin = new ServerlessEsbuildPrisma(
        mockServerless,
        mockOptions,
      );

      mockConfig.getFunctionNamesForProcess.mockReturnValue([
        'function1',
        'function2',
      ]);
      mockServerless.service.getFunction.mockImplementation(() => ({
        handler: 'src/handler.handler',
        environment: {},
      }));

      await layerPlugin.onBeforePackage();

      expect(
        mockConfig.getFunctionNamesForProcess,
      ).toHaveBeenCalled();
      expect(mockServerless.service.getFunction).toHaveBeenCalledWith(
        'function1',
      );
      expect(mockServerless.service.getFunction).toHaveBeenCalledWith(
        'function2',
      );
      expect(
        mockFunctionManager.setPrismaEnvironmentVariables,
      ).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Setting Prisma environment variables for functions...',
      );
      expect(mockLogger.success).toHaveBeenCalledWith(
        'Prisma environment variables set for all functions',
      );
    });

    it('should skip setting environment variables when useLayer is false', async () => {
      // Clear any previous calls to mocks
      jest.clearAllMocks();

      // Ensure the mock returns false for layer config
      mockConfig.getUseLayer.mockReturnValue(false);

      // Create a new plugin instance to ensure fresh mocks
      const testPlugin = new ServerlessEsbuildPrisma(
        mockServerless,
        mockOptions,
      );

      await testPlugin.onBeforePackage();

      // Should not call setPrismaEnvironmentVariables
      expect(
        mockFunctionManager.setPrismaEnvironmentVariables,
      ).not.toHaveBeenCalled();

      // Should log debug message about skipping
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Skipping Prisma environment variables setup (not using layers)',
      );

      // Should not log success message
      expect(mockLogger.success).not.toHaveBeenCalledWith(
        'Prisma environment variables set for all functions',
      );
    });

    it('should handle functions without handler gracefully when useLayer is true', async () => {
      // Reset the plugin to get fresh config with useLayer = true
      mockConfig.getUseLayer.mockReturnValue(true);
      const layerPlugin = new ServerlessEsbuildPrisma(
        mockServerless,
        mockOptions,
      );

      mockConfig.getFunctionNamesForProcess.mockReturnValue([
        'function1',
      ]);
      mockServerless.service.getFunction.mockImplementation(name => {
        if (name === 'function1') {
          return { environment: {} }; // No handler property
        }
        return { handler: 'src/handler.handler', environment: {} };
      });

      await layerPlugin.onBeforePackage();

      // Should not call setPrismaEnvironmentVariables for functions without handler
      expect(
        mockFunctionManager.setPrismaEnvironmentVariables,
      ).toHaveBeenCalledTimes(0);
    });

    it('should handle invalid functions gracefully when useLayer is true', async () => {
      // Reset the plugin to get fresh config with useLayer = true
      mockConfig.getUseLayer.mockReturnValue(true);
      const layerPlugin = new ServerlessEsbuildPrisma(
        mockServerless,
        mockOptions,
      );

      mockConfig.getFunctionNamesForProcess.mockReturnValue([
        'function1',
      ]);
      mockServerless.service.getFunction.mockImplementation(name => {
        if (name === 'function1') {
          return null;
        }
        return { handler: 'src/handler.handler', environment: {} };
      });

      await layerPlugin.onBeforePackage();

      // Should not call setPrismaEnvironmentVariables for null functions
      expect(
        mockFunctionManager.setPrismaEnvironmentVariables,
      ).toHaveBeenCalledTimes(0);
    });
  });

  describe('onPackageFinalize', () => {
    it('should process functions with layer when useLayer is true', async () => {
      mockConfig.getUseLayer.mockReturnValue(true);
      // Reset the plugin to get fresh config
      plugin = new ServerlessEsbuildPrisma(
        mockServerless,
        mockOptions,
      );

      await plugin.onPackageFinalize();

      expect(mockLayerManager.createLayerZip).toHaveBeenCalledWith(
        '/path/to/schema.prisma',
      );
      expect(mockLogger.success).toHaveBeenCalledWith(
        'Layer zip generated for deployment',
      );
      expect(
        mockFunctionManager.writePrismaSchemaToZip,
      ).toHaveBeenCalledWith('function1', {
        prismaSchema: '/path/to/schema.prisma',
      });
      expect(
        mockFunctionManager.writePrismaSchemaToZip,
      ).toHaveBeenCalledWith('function2', {
        prismaSchema: '/path/to/schema.prisma',
      });
    });

    it('should process functions without layer when useLayer is false', async () => {
      mockConfig.getUseLayer.mockReturnValue(false);

      await plugin.onPackageFinalize();

      expect(mockLayerManager.createLayerZip).not.toHaveBeenCalled();
      expect(
        mockFunctionManager.writePrismaSchemaAndEngineToZip,
      ).toHaveBeenCalledWith('function1', {
        prismaSchema: '/path/to/schema.prisma',
      });
      expect(
        mockFunctionManager.writePrismaSchemaAndEngineToZip,
      ).toHaveBeenCalledWith('function2', {
        prismaSchema: '/path/to/schema.prisma',
      });
    });
  });

  describe('onBeforeDeploy', () => {
    it('should skip when useLayer is false', async () => {
      mockConfig.getUseLayer.mockReturnValue(false);

      await plugin.onBeforeDeploy();

      expect(
        mockLayerManager.handleLayerDeploymentFromZip,
      ).not.toHaveBeenCalled();
    });

    it('should skip when deployProcessed is true', async () => {
      mockConfig.getUseLayer.mockReturnValue(true);
      plugin.deployProcessed = true;

      await plugin.onBeforeDeploy();

      expect(
        mockLayerManager.handleLayerDeploymentFromZip,
      ).not.toHaveBeenCalled();
    });

    it('should handle layer deployment when useLayer is true and not processed', async () => {
      mockConfig.getUseLayer.mockReturnValue(true);
      // Reset the plugin to get fresh config
      plugin = new ServerlessEsbuildPrisma(
        mockServerless,
        mockOptions,
      );
      plugin.deployProcessed = false;

      await plugin.onBeforeDeploy();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting Prisma layer deployment process',
      );
      expect(mockLayerManager.createLayerZip).toHaveBeenCalledWith(
        '/path/to/schema.prisma',
      );
      expect(
        mockLayerManager.handleLayerDeploymentFromZip,
      ).toHaveBeenCalledWith('/path/to/layer.zip');
      expect(plugin.deployProcessed).toBe(true);
      expect(mockLogger.success).toHaveBeenCalledWith(
        'Prisma layer deployment process completed',
      );
    });
  });

  describe('onAfterDeploy', () => {
    it('should skip when useLayer is false', async () => {
      mockConfig.getUseLayer.mockReturnValue(false);

      await plugin.onAfterDeploy();

      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Updating functions'),
      );
    });

    it('should update functions with latest layer when useLayer is true', async () => {
      mockConfig.getUseLayer.mockReturnValue(true);
      // Reset the plugin to get fresh config
      plugin = new ServerlessEsbuildPrisma(
        mockServerless,
        mockOptions,
      );
      plugin.updateFunctionsWithLatestLayer = jest.fn();

      await plugin.onAfterDeploy();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Updating functions with latest layer version...',
      );
      expect(
        plugin.updateFunctionsWithLatestLayer,
      ).toHaveBeenCalled();
      expect(mockLogger.success).toHaveBeenCalledWith(
        'Functions updated with latest layer version',
      );
    });
  });

  describe('onBeforeMergeCustomResources', () => {
    it('should remove layers from template when useLayer is false', async () => {
      mockConfig.getUseLayer.mockReturnValue(false);

      await plugin.onBeforeMergeCustomResources();

      expect(
        mockCloudFormationManager.removeLayersFromTemplate,
      ).toHaveBeenCalled();
    });

    it('should handle layer assignment when useLayer is true', async () => {
      mockConfig.getUseLayer.mockReturnValue(true);
      // Reset the plugin to get fresh config
      plugin = new ServerlessEsbuildPrisma(
        mockServerless,
        mockOptions,
      );
      plugin.handleLayerAssignment = jest.fn();

      await plugin.onBeforeMergeCustomResources();

      expect(plugin.handleLayerAssignment).toHaveBeenCalled();
    });
  });

  describe('handleLayerAssignment', () => {
    it('should add layers to template with existing layer ARN', async () => {
      await plugin.handleLayerAssignment();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Adding layers to CloudFormation template...',
      );
      expect(mockLayerManager.getLatestLayerArn).toHaveBeenCalledWith(
        'test-layer',
      );
      expect(
        mockCloudFormationManager.addLayersToTemplate,
      ).toHaveBeenCalledWith(
        'arn:aws:lambda:us-west-2:123456789012:layer:test-layer:1',
      );
      expect(mockLogger.success).toHaveBeenCalledWith(
        expect.stringContaining(
          'Added layer to CloudFormation template',
        ),
      );
    });

    it('should add placeholder layer ARN when no existing layer', async () => {
      mockLayerManager.getLatestLayerArn.mockResolvedValue(null);

      await plugin.handleLayerAssignment();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'No existing layer found, adding placeholder for first-time deployment',
      );
      expect(
        mockCloudFormationManager.addLayersToTemplate,
      ).toHaveBeenCalledWith(
        'arn:aws:lambda:us-west-2:123456789012:layer:test-layer:1',
      );
    });

    it('should handle errors during layer assignment', async () => {
      mockLayerManager.getLatestLayerArn.mockRejectedValue(
        new Error('Layer error'),
      );

      await plugin.handleLayerAssignment();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Error adding layers to CloudFormation template',
        ),
      );
    });
  });

  describe('updateFunctionsWithLatestLayer', () => {
    it('should update functions with latest layer ARN', async () => {
      await plugin.updateFunctionsWithLatestLayer();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Using latest layer ARN'),
      );
      expect(
        mockCloudFormationManager.updateLayersInTemplate,
      ).toHaveBeenCalledWith(
        'arn:aws:lambda:us-west-2:123456789012:layer:test-layer:1',
      );
      expect(
        mockFunctionManager.updateFunctionsWithLayer,
      ).toHaveBeenCalledWith(
        'arn:aws:lambda:us-west-2:123456789012:layer:test-layer:1',
        'Updated function with latest layer',
        true,
      );
    });

    it('should warn when no layer versions found', async () => {
      mockLayerManager.getLatestLayerArn.mockResolvedValue(null);

      await plugin.updateFunctionsWithLatestLayer();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No layer versions found after deployment',
      );
    });

    it('should handle errors during function update', async () => {
      mockLayerManager.getLatestLayerArn.mockRejectedValue(
        new Error('Update error'),
      );

      await plugin.updateFunctionsWithLatestLayer();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error updating function layers'),
      );
    });
  });
});
