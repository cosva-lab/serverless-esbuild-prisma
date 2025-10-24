const { getSchemaWithPath } = require('@prisma/internals');
const Logger = require('./lib/logger');
const ConfigManager = require('./lib/config');
const LayerManager = require('./lib/layer-manager');
const FunctionManager = require('./lib/function-manager');

class ServerlessEsbuildPrisma {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    
    // Initialize managers
    this.config = new ConfigManager(serverless);
    this.logger = new Logger(serverless);
    this.layerManager = new LayerManager(serverless, this.config, this.logger);
    this.functionManager = new FunctionManager(serverless, this.config, this.logger);
    
    // Configuration
    this.useLayer = this.config.getLayerConfig();
    this.deployProcessed = false;
    
    // Commands and hooks
    this.commands = {
      esbuildprisma: {
        usage: 'Embeds the prisma schema and engine',
        lifecycleEvents: ['package'],
      },
    };
    
    this.hooks = {
      'after:package:createDeploymentArtifacts': this.onBeforePackageFinalize.bind(this),
      'before:deploy:deploy': this.onBeforeDeploy.bind(this),
      'before:deploy:createDeploymentArtifacts': this.onBeforeDeploy.bind(this),
      'before:package:initialize': this.onBeforePackageInitialize.bind(this),
      'before:print:print': this.onBeforePrint.bind(this),
    };
  }

  async onBeforePrint() {
    // Add layers and environment variables to functions for sls print
    if (this.useLayer) {
      await this.addLayersToFunctions();
    }
  }

  async onBeforePackageInitialize() {
    if (this.useLayer) {
      await this.addLayersToFunctions();
    }
  }

  async onBeforePackageFinalize() {
    const functionNames = this.config.getFunctionNamesForProcess();
    const { schemaPath } = await getSchemaWithPath();

    if (this.useLayer) {
      await this.layerManager.createLayerZip(schemaPath);
      this.logger.success('Layer zip generated for deployment');
    }

    for (const functionName of functionNames) {
      if (this.useLayer) {
        this.functionManager.writePrismaSchemaToZip(functionName, { prismaSchema: schemaPath });
      } else {
        this.functionManager.writePrismaSchemaAndEngineToZip(functionName, {
          prismaSchema: schemaPath,
        });
      }
    }
  }

  async onBeforeDeploy() {
    if (!this.useLayer) {
      return;
    }

    if (this.deployProcessed) {
      this.logger.debug('Deploy process already executed, skipping');
      return;
    }

    this.logger.info('Starting Prisma layer deployment process');
    
    const { schemaPath } = await getSchemaWithPath();
    const layerZipPath = await this.layerManager.createLayerZip(schemaPath);
    
    await this.layerManager.handleLayerDeploymentFromZip(layerZipPath);
    await this.updateFunctionLayersAfterDeployment();
    
    this.deployProcessed = true;
    this.logger.success('Prisma layer deployment process completed');
  }

  async addLayersToFunctions() {
    try {
      const layerName = this.config.getLayerName();
      this.logger.info(`Adding layers to functions for layer: ${layerName}`);
      
      let layerArn = await this.layerManager.getLatestLayerArn(layerName);
      
      if (layerArn) {
        this.logger.info(`Found existing layer: ${layerArn}`);
      } else {
        this.logger.info('No existing layer found, will create during deployment');
        layerArn = `arn:aws:lambda:${this.config.getRegion()}:${await this.layerManager.getAccountId()}:layer:${layerName}:LATEST`;
      }
      
      await this.functionManager.updateFunctionsWithLayer(layerArn, 'Added layer to function');
    } catch (error) {
      this.logger.error(`Error adding layers to functions: ${error.message}`);
    }
  }

  async updateFunctionLayersAfterDeployment() {
    try {
      const layerName = this.config.getLayerName();
      const layerArn = await this.layerManager.getLatestLayerArn(layerName);
      
      if (!layerArn) {
        this.logger.warn('No layer versions found after deployment');
        return;
      }
      
      this.logger.info(`Using deployed layer ARN: ${layerArn}`);
      await this.functionManager.updateFunctionsWithLayer(layerArn, 'Updated function', true);
    } catch (error) {
      this.logger.error(`Error updating function layers after deployment: ${error.message}`);
      throw error;
    }
  }
}

module.exports = ServerlessEsbuildPrisma;