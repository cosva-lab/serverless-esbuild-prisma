// Global test setup
global.console = {
  ...console,
  // Suppress console output during tests unless explicitly needed
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock glob module
jest.mock('glob', () => ({
  sync: jest.fn(() => []),
}));

// Mock adm-zip module
jest.mock('adm-zip', () => {
  return jest.fn().mockImplementation(() => ({
    addLocalFile: jest.fn(),
    addLocalFolder: jest.fn(),
    writeZip: jest.fn(),
    toBuffer: jest.fn(() => Buffer.from('mock-zip-content')),
  }));
});

// Mock AWS SDK
jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn(),
  PublishLayerVersionCommand: jest.fn(),
  UpdateFunctionConfigurationCommand: jest.fn(),
  ListLayerVersionsCommand: jest.fn(),
  ListLayersCommand: jest.fn(),
  GetLayerVersionCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-sts', () => ({
  STSClient: jest.fn(),
  GetCallerIdentityCommand: jest.fn(),
}));
