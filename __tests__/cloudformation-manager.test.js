const CloudFormationManager = require('../lib/utils/cloudformation-manager').default;

describe('CloudFormationManager', () => {
  let mockServerless;
  let mockConfig;
  let mockLogger;
  let cloudFormationManager;

  beforeEach(() => {
    mockServerless = {
      service: {
        provider: {
          compiledCloudFormationTemplate: {
            Resources: {
              'Function1LambdaFunction': {
                Properties: {
                  Layers: []
                }
              },
              'Function2LambdaFunction': {
                Properties: {
                  Layers: ['existing-layer']
                }
              }
            }
          }
        }
      },
      providers: {
        aws: {
          naming: {
            getLambdaLogicalId: jest.fn((functionName) => `${functionName}LambdaFunction`)
          }
        }
      }
    };

    mockConfig = {
      getFunctionNamesForProcess: jest.fn(() => ['Function1', 'Function2'])
    };

    mockLogger = {
      warn: jest.fn(),
      error: jest.fn()
    };

    cloudFormationManager = new CloudFormationManager(mockServerless, mockConfig, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(cloudFormationManager.serverless).toBe(mockServerless);
      expect(cloudFormationManager.config).toBe(mockConfig);
      expect(cloudFormationManager.logger).toBe(mockLogger);
    });
  });

  describe('addLayersToTemplate', () => {
    it('should call modifyTemplate with add operation', async () => {
      cloudFormationManager.modifyTemplate = jest.fn();
      
      await cloudFormationManager.addLayersToTemplate('arn:aws:lambda:us-west-2:123456789012:layer:test-layer:1');

      expect(cloudFormationManager.modifyTemplate).toHaveBeenCalledWith('add', 'arn:aws:lambda:us-west-2:123456789012:layer:test-layer:1');
    });
  });

  describe('removeLayersFromTemplate', () => {
    it('should call modifyTemplate with remove operation', async () => {
      cloudFormationManager.modifyTemplate = jest.fn();
      
      await cloudFormationManager.removeLayersFromTemplate();

      expect(cloudFormationManager.modifyTemplate).toHaveBeenCalledWith('remove', null);
    });
  });

  describe('updateLayersInTemplate', () => {
    it('should call modifyTemplate with update operation', async () => {
      cloudFormationManager.modifyTemplate = jest.fn();
      
      await cloudFormationManager.updateLayersInTemplate('arn:aws:lambda:us-west-2:123456789012:layer:test-layer:2');

      expect(cloudFormationManager.modifyTemplate).toHaveBeenCalledWith('update', 'arn:aws:lambda:us-west-2:123456789012:layer:test-layer:2');
    });
  });

  describe('modifyTemplate', () => {
    it('should handle missing compiled template', async () => {
      mockServerless.service.provider.compiledCloudFormationTemplate = null;

      await cloudFormationManager.modifyTemplate('add', 'test-layer-arn');

      expect(mockLogger.warn).toHaveBeenCalledWith('No compiled CloudFormation template found');
    });

    it('should process all functions for add operation', async () => {
      cloudFormationManager.addLayerToFunctionResource = jest.fn();

      await cloudFormationManager.modifyTemplate('add', 'test-layer-arn');

      expect(mockConfig.getFunctionNamesForProcess).toHaveBeenCalled();
      expect(cloudFormationManager.addLayerToFunctionResource).toHaveBeenCalledWith(
        mockServerless.service.provider.compiledCloudFormationTemplate.Resources['Function1LambdaFunction'],
        'Function1LambdaFunction',
        'test-layer-arn'
      );
      expect(cloudFormationManager.addLayerToFunctionResource).toHaveBeenCalledWith(
        mockServerless.service.provider.compiledCloudFormationTemplate.Resources['Function2LambdaFunction'],
        'Function2LambdaFunction',
        'test-layer-arn'
      );
    });

    it('should process all functions for remove operation', async () => {
      cloudFormationManager.removeLayersFromFunctionResource = jest.fn();

      await cloudFormationManager.modifyTemplate('remove', null);

      expect(cloudFormationManager.removeLayersFromFunctionResource).toHaveBeenCalledWith(
        mockServerless.service.provider.compiledCloudFormationTemplate.Resources['Function1LambdaFunction']
      );
      expect(cloudFormationManager.removeLayersFromFunctionResource).toHaveBeenCalledWith(
        mockServerless.service.provider.compiledCloudFormationTemplate.Resources['Function2LambdaFunction']
      );
    });

    it('should process all functions for update operation', async () => {
      cloudFormationManager.updateLayerInFunctionResource = jest.fn();

      await cloudFormationManager.modifyTemplate('update', 'new-layer-arn');

      expect(cloudFormationManager.updateLayerInFunctionResource).toHaveBeenCalledWith(
        mockServerless.service.provider.compiledCloudFormationTemplate.Resources['Function1LambdaFunction'],
        'new-layer-arn'
      );
      expect(cloudFormationManager.updateLayerInFunctionResource).toHaveBeenCalledWith(
        mockServerless.service.provider.compiledCloudFormationTemplate.Resources['Function2LambdaFunction'],
        'new-layer-arn'
      );
    });

    it('should handle missing function resources', async () => {
      mockServerless.providers.aws.naming.getLambdaLogicalId.mockReturnValue('NonExistentFunction');
      cloudFormationManager.addLayerToFunctionResource = jest.fn();

      await cloudFormationManager.modifyTemplate('add', 'test-layer-arn');

      expect(cloudFormationManager.addLayerToFunctionResource).not.toHaveBeenCalled();
    });

    it('should handle errors and rethrow', async () => {
      mockConfig.getFunctionNamesForProcess.mockImplementation(() => {
        throw new Error('Config error');
      });

      await expect(cloudFormationManager.modifyTemplate('add', 'test-layer-arn'))
        .rejects.toThrow('Config error');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Error modifying CloudFormation template'));
    });
  });

  describe('addLayerToFunctionResource', () => {
    it('should add layer to function resource', () => {
      const functionResource = {
        Properties: {
          Layers: ['existing-layer']
        }
      };

      cloudFormationManager.addLayerToFunctionResource(functionResource, 'Function1LambdaFunction', 'new-layer-arn');

      expect(functionResource.Properties.Layers).toContain('new-layer-arn');
      expect(functionResource.Properties.Layers).toContain('existing-layer');
    });

    it('should initialize Properties and Layers if not exist', () => {
      const functionResource = {};

      cloudFormationManager.addLayerToFunctionResource(functionResource, 'Function1LambdaFunction', 'new-layer-arn');

      expect(functionResource.Properties).toBeDefined();
      expect(functionResource.Properties.Layers).toEqual(['new-layer-arn']);
    });

    it('should not add duplicate layers', () => {
      const functionResource = {
        Properties: {
          Layers: ['new-layer-arn']
        }
      };

      cloudFormationManager.addLayerToFunctionResource(functionResource, 'Function1LambdaFunction', 'new-layer-arn');

      expect(functionResource.Properties.Layers).toEqual(['new-layer-arn']);
    });
  });

  describe('removeLayersFromFunctionResource', () => {
    it('should remove Prisma layers from function resource', () => {
      const functionResource = {
        Properties: {
          Layers: ['prisma-layer-1', 'other-layer', 'prisma-layer-2']
        }
      };

      cloudFormationManager.removeLayersFromFunctionResource(functionResource, 'Function1LambdaFunction');

      expect(functionResource.Properties.Layers).toEqual(['other-layer']);
    });

    it('should remove Layers property if empty after filtering', () => {
      const functionResource = {
        Properties: {
          Layers: ['prisma-layer-1', 'prisma-layer-2']
        }
      };

      cloudFormationManager.removeLayersFromFunctionResource(functionResource, 'Function1LambdaFunction');

      expect(functionResource.Properties.Layers).toBeUndefined();
    });

    it('should handle function resource without Properties', () => {
      const functionResource = {};

      cloudFormationManager.removeLayersFromFunctionResource(functionResource, 'Function1LambdaFunction');

      expect(functionResource.Properties).toBeUndefined();
    });

    it('should handle function resource without Layers', () => {
      const functionResource = {
        Properties: {}
      };

      cloudFormationManager.removeLayersFromFunctionResource(functionResource, 'Function1LambdaFunction');

      expect(functionResource.Properties.Layers).toBeUndefined();
    });

    it('should preserve non-string layers', () => {
      const functionResource = {
        Properties: {
          Layers: [
            'prisma-layer-1',
            { Ref: 'SomeLayer' },
            'other-layer'
          ]
        }
      };

      cloudFormationManager.removeLayersFromFunctionResource(functionResource, 'Function1LambdaFunction');

      expect(functionResource.Properties.Layers).toEqual([
        { Ref: 'SomeLayer' },
        'other-layer'
      ]);
    });
  });

  describe('updateLayerInFunctionResource', () => {
    it('should update Prisma layers ending with :1', () => {
      const functionResource = {
        Properties: {
          Layers: [
            'arn:aws:lambda:us-west-2:123456789012:layer:prisma-layer:1',
            'other-layer',
            'arn:aws:lambda:us-west-2:123456789012:layer:prisma-layer:2'
          ]
        }
      };

      cloudFormationManager.updateLayerInFunctionResource(
        functionResource,
        'arn:aws:lambda:us-west-2:123456789012:layer:prisma-layer:3'
      );

      expect(functionResource.Properties.Layers).toEqual([
        'arn:aws:lambda:us-west-2:123456789012:layer:prisma-layer:3',
        'other-layer',
        'arn:aws:lambda:us-west-2:123456789012:layer:prisma-layer:2'
      ]);
    });

    it('should handle function resource without Properties', () => {
      const functionResource = {};

      cloudFormationManager.updateLayerInFunctionResource(
        functionResource,
        'Function1LambdaFunction',
        'new-layer-arn'
      );

      expect(functionResource.Properties).toBeUndefined();
    });

    it('should handle function resource without Layers', () => {
      const functionResource = {
        Properties: {}
      };

      cloudFormationManager.updateLayerInFunctionResource(
        functionResource,
        'Function1LambdaFunction',
        'new-layer-arn'
      );

      expect(functionResource.Properties.Layers).toBeUndefined();
    });

    it('should not update non-Prisma layers', () => {
      const functionResource = {
        Properties: {
          Layers: [
            'arn:aws:lambda:us-west-2:123456789012:layer:other-layer:1',
            'other-layer'
          ]
        }
      };

      cloudFormationManager.updateLayerInFunctionResource(
        functionResource,
        'Function1LambdaFunction',
        'new-layer-arn'
      );

      expect(functionResource.Properties.Layers).toEqual([
        'arn:aws:lambda:us-west-2:123456789012:layer:other-layer:1',
        'other-layer'
      ]);
    });
  });
});
