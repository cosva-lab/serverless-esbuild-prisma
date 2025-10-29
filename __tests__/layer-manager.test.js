const LayerManager = require('../lib/utils/layer-manager').default;

// Mock AWS SDK
jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn(),
  PublishLayerVersionCommand: jest.fn(),
  ListLayerVersionsCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-sts', () => ({
  STSClient: jest.fn(),
  GetCallerIdentityCommand: jest.fn(),
}));

const { LambdaClient } = require('@aws-sdk/client-lambda');
const {
  STSClient,
  GetCallerIdentityCommand,
} = require('@aws-sdk/client-sts');
const fs = require('fs');

// Mock fs module
jest.mock('fs');
jest.mock('path');

describe('LayerManager', () => {
  let mockServerless;
  let mockConfig;
  let mockLogger;
  let mockEngineDetector;
  let layerManager;
  let mockLambdaClient;
  let mockStsClient;

  beforeEach(() => {
    mockServerless = {
      service: {
        provider: {
          region: 'us-west-2',
        },
      },
    };

    mockConfig = {
      getRegion: jest.fn(() => 'us-west-2'),
      getLayerName: jest.fn(() => 'test-layer'),
      getLayerDescription: jest.fn(() => 'Test layer description'),
    };

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      success: jest.fn(),
      error: jest.fn(),
    };

    mockEngineDetector = {
      getEnginePaths: jest.fn(() => [
        '/path/to/engine1',
        '/path/to/engine2',
      ]),
    };

    // Mock AWS clients
    mockLambdaClient = {
      send: jest.fn(),
    };
    mockStsClient = {
      send: jest.fn(),
    };

    // Mock the constructors
    LambdaClient.mockImplementation(() => mockLambdaClient);
    STSClient.mockImplementation(() => mockStsClient);

    layerManager = new LayerManager(
      mockServerless,
      mockConfig,
      mockLogger,
    );
    layerManager.engineDetector = mockEngineDetector;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(layerManager.serverless).toBe(mockServerless);
      expect(layerManager.config).toBe(mockConfig);
      expect(layerManager.logger).toBe(mockLogger);
    });
  });

  describe('getAccountId', () => {
    it('should return account ID from STS', async () => {
      mockStsClient.send.mockResolvedValue({
        Account: '123456789012',
      });

      const result = await layerManager.getAccountId();
      expect(result).toBe('123456789012');
      expect(mockStsClient.send).toHaveBeenCalledWith(
        expect.any(GetCallerIdentityCommand),
      );
    });

    it('should return default account ID on error', async () => {
      mockStsClient.send.mockRejectedValue(new Error('STS error'));

      const result = await layerManager.getAccountId();
      expect(result).toBe('123456789012');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error getting account ID'),
      );
    });
  });

  describe('createLayerZip', () => {
    beforeEach(() => {
      fs.readFileSync.mockImplementation(filePath => {
        if (filePath.includes('schema')) {
          return Buffer.from('schema content');
        }
        return Buffer.from('engine content');
      });
      fs.writeFileSync = jest.fn();
    });

    it('should create layer zip with engines', async () => {
      const mockZip = {
        addFile: jest.fn(),
        writeZip: jest.fn(),
      };
      const AdmZip = require('adm-zip');
      AdmZip.mockImplementation(() => mockZip);

      const result = await layerManager.createLayerZip();

      expect(mockEngineDetector.getEnginePaths).toHaveBeenCalled();
      expect(mockZip.addFile).toHaveBeenCalled();
      expect(mockZip.writeZip).toHaveBeenCalled();
      expect(result).toBe('./.serverless/prisma-layer.zip');
    });
  });

  describe('layerExists', () => {
    it('should return true when layer exists', async () => {
      mockLambdaClient.send.mockResolvedValue({
        Layers: [
          { LayerName: 'test-layer' },
          { LayerName: 'other-layer' },
        ],
      });

      const result = await layerManager.layerExists('test-layer');
      expect(result).toBe(true);
    });

    it('should return false when layer does not exist', async () => {
      mockLambdaClient.send.mockResolvedValue({
        Layers: [{ LayerName: 'other-layer' }],
      });

      const result = await layerManager.layerExists('test-layer');
      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockLambdaClient.send.mockRejectedValue(
        new Error('Lambda error'),
      );

      const result = await layerManager.layerExists('test-layer');
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error checking if layer exists'),
      );
    });
  });

  describe('layerNeedsUpdate', () => {
    beforeEach(() => {
      layerManager.calculateLayerContentHash = jest.fn(
        () => 'new-hash',
      );
      layerManager.getCurrentLayerHash = jest.fn(() =>
        Promise.resolve('old-hash'),
      );
    });

    it('should return true when no versions exist', async () => {
      mockLambdaClient.send.mockResolvedValue({
        LayerVersions: [],
      });

      const result = await layerManager.layerNeedsUpdate(
        '/path/to/zip',
        'test-layer',
      );
      expect(result).toBe(true);
    });

    it('should return true when content hash differs', async () => {
      mockLambdaClient.send.mockResolvedValue({
        LayerVersions: [{ Version: 1 }],
      });

      const result = await layerManager.layerNeedsUpdate(
        '/path/to/zip',
        'test-layer',
      );
      expect(result).toBe(true);
      expect(
        layerManager.calculateLayerContentHash,
      ).toHaveBeenCalled();
      expect(layerManager.getCurrentLayerHash).toHaveBeenCalledWith(
        'test-layer',
        1,
      );
    });

    it('should return false when content hash matches', async () => {
      layerManager.getCurrentLayerHash = jest.fn(() =>
        Promise.resolve('new-hash'),
      );
      mockLambdaClient.send.mockResolvedValue({
        LayerVersions: [{ Version: 1 }],
      });

      const result = await layerManager.layerNeedsUpdate(
        '/path/to/zip',
        'test-layer',
      );
      expect(result).toBe(false);
    });

    it('should return true on error', async () => {
      mockLambdaClient.send.mockRejectedValue(
        new Error('Lambda error'),
      );

      const result = await layerManager.layerNeedsUpdate(
        '/path/to/zip',
        'test-layer',
      );
      expect(result).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error checking layer update'),
      );
    });
  });

  describe('calculateLayerContentHash', () => {
    beforeEach(() => {
      fs.readFileSync.mockReturnValue(Buffer.from('engine content'));
    });

    it('should calculate hash from engine paths', () => {
      const result = layerManager.calculateLayerContentHash();
      expect(typeof result).toBe('string');
      expect(result).toHaveLength(64); // SHA256 hex length
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Calculated hash for 2 engines'),
      );
    });
  });

  describe('getCurrentLayerHash', () => {
    it('should extract hash from layer description', async () => {
      mockLambdaClient.send.mockResolvedValue({
        Description: 'Layer description (hash:abc123def456)',
      });

      const result = await layerManager.getCurrentLayerHash(
        'test-layer',
        1,
      );
      expect(result).toBe('abc123def456');
    });

    it('should return null when no hash in description', async () => {
      mockLambdaClient.send.mockResolvedValue({
        Description: 'Layer description without hash',
      });

      const result = await layerManager.getCurrentLayerHash(
        'test-layer',
        1,
      );
      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockLambdaClient.send.mockRejectedValue(
        new Error('Lambda error'),
      );

      const result = await layerManager.getCurrentLayerHash(
        'test-layer',
        1,
      );
      expect(result).toBeNull();
    });
  });

  describe('uploadLayer', () => {
    beforeEach(() => {
      fs.readFileSync.mockReturnValue(Buffer.from('zip content'));
      layerManager.calculateLayerContentHash = jest.fn(
        () => 'test-hash',
      );
    });

    it('should upload layer successfully', async () => {
      mockLambdaClient.send.mockResolvedValue({
        Version: 1,
        LayerArn:
          'arn:aws:lambda:us-west-2:123456789012:layer:test-layer:1',
      });

      const result = await layerManager.uploadLayer(
        '/path/to/zip',
        'test-layer',
        'Test description',
      );

      expect(mockLambdaClient.send).toHaveBeenCalled();
      expect(mockLogger.success).toHaveBeenCalledWith(
        expect.stringContaining('Layer uploaded successfully'),
      );
      expect(result.Version).toBe(1);
    });

    it('should throw error on upload failure', async () => {
      mockLambdaClient.send.mockRejectedValue(
        new Error('Upload failed'),
      );

      await expect(
        layerManager.uploadLayer(
          '/path/to/zip',
          'test-layer',
          'Test description',
        ),
      ).rejects.toThrow('Upload failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error uploading layer'),
      );
    });
  });

  describe('handleLayerDeploymentFromZip', () => {
    beforeEach(() => {
      layerManager.layerExists = jest.fn();
      layerManager.layerNeedsUpdate = jest.fn();
      layerManager.uploadLayer = jest.fn();
    });

    it('should upload layer when it does not exist', async () => {
      layerManager.layerExists.mockResolvedValue(false);
      layerManager.uploadLayer.mockResolvedValue({ Version: 1 });

      await layerManager.handleLayerDeploymentFromZip('/path/to/zip');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Processing Prisma layer'),
      );
      expect(layerManager.uploadLayer).toHaveBeenCalled();
      expect(mockLogger.success).toHaveBeenCalledWith(
        'Layer uploaded successfully',
      );
    });

    it('should upload layer when it needs update', async () => {
      layerManager.layerExists.mockResolvedValue(true);
      layerManager.layerNeedsUpdate.mockResolvedValue(true);
      layerManager.uploadLayer.mockResolvedValue({ Version: 1 });

      await layerManager.handleLayerDeploymentFromZip('/path/to/zip');

      expect(layerManager.uploadLayer).toHaveBeenCalled();
    });

    it('should skip upload when layer does not need update', async () => {
      layerManager.layerExists.mockResolvedValue(true);
      layerManager.layerNeedsUpdate.mockResolvedValue(false);

      await layerManager.handleLayerDeploymentFromZip('/path/to/zip');

      expect(layerManager.uploadLayer).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Layer content unchanged, skipping upload',
      );
    });
  });

  describe('getLatestLayerArn', () => {
    it('should return latest layer ARN when versions exist', async () => {
      mockLambdaClient.send.mockResolvedValue({
        LayerVersions: [
          {
            Version: 2,
            LayerArn:
              'arn:aws:lambda:us-west-2:123456789012:layer:test-layer:2',
          },
          {
            Version: 1,
            LayerArn:
              'arn:aws:lambda:us-west-2:123456789012:layer:test-layer:1',
          },
        ],
      });

      const result =
        await layerManager.getLatestLayerArn('test-layer');
      expect(result).toBe(
        'arn:aws:lambda:us-west-2:123456789012:layer:test-layer:2',
      );
    });

    it('should construct ARN when LayerArn not provided', async () => {
      layerManager.getAccountId = jest.fn(() =>
        Promise.resolve('123456789012'),
      );
      mockLambdaClient.send.mockResolvedValue({
        LayerVersions: [{ Version: 1 }],
      });

      const result =
        await layerManager.getLatestLayerArn('test-layer');
      expect(result).toBe(
        'arn:aws:lambda:us-west-2:123456789012:layer:test-layer:1',
      );
    });

    it('should return null when no versions exist', async () => {
      mockLambdaClient.send.mockResolvedValue({
        LayerVersions: [],
      });

      const result =
        await layerManager.getLatestLayerArn('test-layer');
      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockLambdaClient.send.mockRejectedValue(
        new Error('Lambda error'),
      );

      const result =
        await layerManager.getLatestLayerArn('test-layer');
      expect(result).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("Layer doesn't exist yet"),
      );
    });
  });
});
