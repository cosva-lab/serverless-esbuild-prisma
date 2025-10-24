const LayerManager = require('../lib/utils/layer-manager');

// Mock the dependencies
jest.mock('@aws-sdk/client-lambda');
jest.mock('@aws-sdk/client-sts');
jest.mock('fs');
jest.mock('path');

describe('LayerManager - Simple Tests', () => {
  let mockServerless;
  let mockConfig;
  let mockLogger;
  let layerManager;

  beforeEach(() => {
    mockServerless = {
      service: {
        provider: {
          region: 'us-west-2'
        }
      }
    };

    mockConfig = {
      getRegion: jest.fn(() => 'us-west-2'),
      getLayerName: jest.fn(() => 'test-layer'),
      getLayerDescription: jest.fn(() => 'Test layer description')
    };

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      success: jest.fn(),
      error: jest.fn()
    };

    layerManager = new LayerManager(mockServerless, mockConfig, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should initialize with correct properties', () => {
      expect(layerManager.serverless).toBe(mockServerless);
      expect(layerManager.config).toBe(mockConfig);
      expect(layerManager.logger).toBe(mockLogger);
    });

    it('should have required methods', () => {
      expect(typeof layerManager.getAccountId).toBe('function');
      expect(typeof layerManager.createLayerZip).toBe('function');
      expect(typeof layerManager.layerExists).toBe('function');
      expect(typeof layerManager.layerNeedsUpdate).toBe('function');
      expect(typeof layerManager.calculateLayerContentHash).toBe('function');
      expect(typeof layerManager.getCurrentLayerHash).toBe('function');
      expect(typeof layerManager.uploadLayer).toBe('function');
      expect(typeof layerManager.handleLayerDeploymentFromZip).toBe('function');
      expect(typeof layerManager.getLatestLayerArn).toBe('function');
    });
  });

  describe('calculateLayerContentHash', () => {
    it('should return a hash string', () => {
      // Mock the engine detector
      layerManager.engineDetector = {
        getEnginePaths: jest.fn(() => [
          '/path/to/engine1',
          '/path/to/engine2'
        ])
      };

      const fs = require('fs');
      fs.readFileSync.mockReturnValue(Buffer.from('engine content'));

      const result = layerManager.calculateLayerContentHash();
      
      expect(typeof result).toBe('string');
      expect(result.length).toBe(64); // SHA256 hex length
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully in getAccountId', async () => {
      const { STSClient } = require('@aws-sdk/client-sts');
      const mockStsClient = {
        send: jest.fn().mockRejectedValue(new Error('STS error'))
      };
      STSClient.mockImplementation(() => mockStsClient);

      const result = await layerManager.getAccountId();
      
      expect(result).toBe('123456789012'); // Default fallback
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Error getting account ID'));
    });
  });
});
