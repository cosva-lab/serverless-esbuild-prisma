import { getSchemaWithPath } from '@prisma/internals';
import Logger from './utils/logger';
import ConfigManager from './utils/config';
import LayerManager from './utils/layer-manager';
import FunctionManager from './utils/function-manager';
import CloudFormationManager from './utils/cloudformation-manager';
import { ServerlessInstance, ServerlessOptions, Commands, Hooks } from './types';

class ServerlessEsbuildPrisma {
  private serverless: ServerlessInstance;
  private options: ServerlessOptions;
  private config: ConfigManager;
  private logger: Logger;
  private layerManager: LayerManager;
  private functionManager: FunctionManager;
  private cloudFormationManager: CloudFormationManager;
  private useLayer: boolean;
  private deployProcessed: boolean;
  public commands: Commands;
  public hooks: Hooks;

  constructor(serverless: ServerlessInstance, options: ServerlessOptions) {
    this.serverless = serverless;
    this.options = options;

    // Initialize core components
    this.config = new ConfigManager(serverless);
    this.logger = new Logger(serverless);
    this.layerManager = new LayerManager(serverless, this.config, this.logger);
    this.functionManager = new FunctionManager(
      serverless,
      this.config,
      this.logger
    );
    this.cloudFormationManager = new CloudFormationManager(
      serverless,
      this.config,
      this.logger
    );

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
      'before:package:createDeploymentArtifacts':
        this.onBeforePackage.bind(this),
      'after:package:createDeploymentArtifacts':
        this.onPackageFinalize.bind(this),
      'before:deploy:deploy': this.onBeforeDeploy.bind(this),
      'after:deploy:deploy': this.onAfterDeploy.bind(this),
      'before:aws:package:finalize:mergeCustomProviderResources':
        this.onBeforeMergeCustomResources.bind(this),
    };
  }

  async onBeforePackage(): Promise<void> {
    // Set Prisma environment variables before CloudFormation is built
    this.logger.info('Setting Prisma environment variables for functions...');

    const functionNames = this.config.getFunctionNamesForProcess();

    for (const functionName of functionNames) {
      try {
        const fn = this.serverless.service.getFunction(functionName);

        if (!fn || typeof fn !== 'object' || !('handler' in fn)) {
          continue;
        }

        // Set environment variables for Prisma
        this.functionManager.setPrismaEnvironmentVariables(fn);
        this.logger.debug(
          `Set Prisma environment variables for function: ${functionName}`
        );
      } catch (error) {
        this.logger.warn(
          `Error setting environment variables for function ${functionName}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    this.logger.success('Prisma environment variables set for all functions');
  }

  async onPackageFinalize(): Promise<void> {
    const functionNames = this.config.getFunctionNamesForProcess();
    const { schemaPath } = await getSchemaWithPath();

    if (this.useLayer) {
      await this.layerManager.createLayerZip(schemaPath);
      this.logger.success('Layer zip generated for deployment');
    }

    for (const functionName of functionNames) {
      if (this.useLayer) {
        this.functionManager.writePrismaSchemaToZip(functionName, {
          prismaSchema: schemaPath,
        });
      } else {
        this.functionManager.writePrismaSchemaAndEngineToZip(functionName, {
          prismaSchema: schemaPath,
        });
      }
    }
  }

  async onBeforeDeploy(): Promise<void> {
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

  async onAfterDeploy(): Promise<void> {
    if (!this.useLayer) {
      return;
    }

    this.logger.info('Updating functions with latest layer version...');
    await this.updateFunctionsWithLatestLayer();
    this.logger.success('Functions updated with latest layer version');
  }

  async onBeforeMergeCustomResources(): Promise<void> {
    if (!this.useLayer) {
      await this.cloudFormationManager.removeLayersFromTemplate();
      return;
    }

    await this.handleLayerAssignment();
  }

  async handleLayerAssignment(): Promise<void> {
    this.logger.info('Adding layers to CloudFormation template...');

    try {
      const layerName = this.config.getLayerName();
      let layerArn = await this.layerManager.getLatestLayerArn(layerName);

      if (!layerArn) {
        this.logger.info(
          'No existing layer found, adding placeholder for first-time deployment'
        );
        const accountId = await this.layerManager.getAccountId();
        const region = this.config.getRegion();
        layerArn = `arn:aws:lambda:${region}:${accountId}:layer:${layerName}:1`;
      }

      await this.cloudFormationManager.addLayersToTemplate(layerArn);
      this.logger.success(
        `Added layer to CloudFormation template: ${layerArn}`
      );
    } catch (error) {
      this.logger.error(
        `Error adding layers to CloudFormation template: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async updateFunctionsWithLatestLayer(): Promise<void> {
    try {
      const layerName = this.config.getLayerName();
      const layerArn = await this.layerManager.getLatestLayerArn(layerName);

      if (!layerArn) {
        this.logger.warn('No layer versions found after deployment');
        return;
      }

      this.logger.info(`Using latest layer ARN: ${layerArn}`);
      await this.cloudFormationManager.updateLayersInTemplate(layerArn);
      await this.functionManager.updateFunctionsWithLayer(
        layerArn,
        'Updated function with latest layer',
        true
      );
    } catch (error) {
      this.logger.error(`Error updating function layers: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export default ServerlessEsbuildPrisma;
