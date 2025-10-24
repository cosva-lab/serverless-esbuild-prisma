const { getSchemaWithPath } = require('@prisma/internals');
const Logger = require('./lib/logger');
const ConfigManager = require('./lib/config');
const LayerManager = require('./lib/layer-manager');
const FunctionManager = require('./lib/function-manager');
const CloudFormationManager = require('./lib/cloudformation-manager');

class ServerlessEsbuildPrisma {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    // Initialize core components
    this.config = new ConfigManager(serverless);
    this.logger = new Logger(serverless);
    this.layerManager = new LayerManager(serverless, this.config, this.logger);
    this.functionManager = new FunctionManager(serverless, this.config, this.logger);
    this.cloudFormationManager = new CloudFormationManager(serverless, this.config, this.logger);

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
      'after:package:createDeploymentArtifacts': this.onPackageFinalize.bind(this),
      'before:deploy:deploy': this.onBeforeDeploy.bind(this),
      'after:deploy:deploy': this.onAfterDeploy.bind(this),
      'before:aws:package:finalize:mergeCustomProviderResources': this.onBeforeMergeCustomResources.bind(this),
    };
  }

  async onPackageFinalize() {
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
        this.functionManager.writePrismaSchemaAndEngineToZip(functionName, { prismaSchema: schemaPath });
      }
    }
  }

  async onBeforeDeploy() {
    if (!this.useLayer || this.deployProcessed) {
      return;
    }

    this.logger.info('Starting Prisma layer deployment process');
    const { schemaPath } = await getSchemaWithPath();
    const layerZipPath = await this.layerManager.createLayerZip(schemaPath);
    await this.layerManager.handleLayerDeploymentFromZip(layerZipPath);
    this.deployProcessed = true;
    this.logger.success('Prisma layer deployment process completed');
  }

  async onAfterDeploy() {
    if (!this.useLayer) {
      return;
    }

    this.logger.info('Updating functions with latest layer version...');
    await this.updateFunctionsWithLatestLayer();
    this.logger.success('Functions updated with latest layer version');
  }

  async onBeforeMergeCustomResources() {
    if (!this.useLayer) {
      await this.cloudFormationManager.removeLayersFromTemplate();
      return;
    }

    await this.handleLayerAssignment();
  }

  async handleLayerAssignment() {
    this.logger.info('Adding layers to CloudFormation template...');
    
    try {
      const layerName = this.config.getLayerName();
      let layerArn = await this.layerManager.getLatestLayerArn(layerName);
      
      if (!layerArn) {
        this.logger.info('No existing layer found, adding placeholder for first-time deployment');
        const accountId = await this.layerManager.getAccountId();
        const region = this.config.getRegion();
        layerArn = `arn:aws:lambda:${region}:${accountId}:layer:${layerName}:1`;
      }
      
      await this.cloudFormationManager.addLayersToTemplate(layerArn);
      this.logger.success(`Added layer to CloudFormation template: ${layerArn}`);
    } catch (error) {
      this.logger.error(`Error adding layers to CloudFormation template: ${error.message}`);
    }
  }

  async updateFunctionsWithLatestLayer() {
    try {
      const layerName = this.config.getLayerName();
      const layerArn = await this.layerManager.getLatestLayerArn(layerName);
      
      if (!layerArn) {
        this.logger.warn('No layer versions found after deployment');
        return;
      }
      
      this.logger.info(`Using latest layer ARN: ${layerArn}`);
      await this.cloudFormationManager.updateLayersInTemplate(layerArn);
      await this.functionManager.updateFunctionsWithLayer(layerArn, 'Updated function with latest layer', true);
    } catch (error) {
      this.logger.error(`Error updating function layers: ${error.message}`);
    }
  }
}

module.exports = ServerlessEsbuildPrisma;
