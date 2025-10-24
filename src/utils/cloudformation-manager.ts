import {
  ServerlessInstance,
  CloudFormationResource,
  CloudFormationTemplate,
} from '../types';
import ConfigManager from './config';
import Logger from './logger';

class CloudFormationManager {
  private serverless: ServerlessInstance;
  private config: ConfigManager;
  private logger: Logger;

  constructor(
    serverless: ServerlessInstance,
    config: ConfigManager,
    logger: Logger,
  ) {
    this.serverless = serverless;
    this.config = config;
    this.logger = logger;
  }

  async addLayersToTemplate(layerArn: string): Promise<void> {
    await this.modifyTemplate('add', layerArn);
  }

  async removeLayersFromTemplate(): Promise<void> {
    await this.modifyTemplate('remove', null);
  }

  async updateLayersInTemplate(newLayerArn: string): Promise<void> {
    await this.modifyTemplate('update', newLayerArn);
  }

  async modifyTemplate(
    operation: string,
    layerArn: string | null,
  ): Promise<void> {
    try {
      const compiledTemplate: CloudFormationTemplate | undefined =
        this.serverless.service.provider
          .compiledCloudFormationTemplate;

      if (!compiledTemplate) {
        this.logger.warn('No compiled CloudFormation template found');
        return;
      }

      const functionNames = this.config.getFunctionNamesForProcess();

      for (const functionName of functionNames) {
        const functionLogicalId =
          this.serverless.providers?.aws?.naming?.getLambdaLogicalId(
            functionName,
          );

        if (!functionLogicalId) {
          this.logger.warn(
            `No logical ID found for function ${functionName}`,
          );
          continue;
        }

        const functionResource =
          compiledTemplate.Resources[functionLogicalId];

        if (!functionResource) {
          this.logger.warn(
            `No function resource found for function ${functionName}`,
          );
          continue;
        }

        if (operation === 'add') {
          this.addLayerToFunctionResource(
            functionResource,
            functionLogicalId,
            layerArn!,
          );
        } else if (operation === 'remove') {
          this.removeLayersFromFunctionResource(functionResource);
        } else if (operation === 'update') {
          this.updateLayerInFunctionResource(
            functionResource,
            layerArn!,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Error modifying CloudFormation template: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  addLayerToFunctionResource(
    functionResource: CloudFormationResource,
    functionLogicalId: string,
    layerArn: string,
  ): void {
    functionResource.Properties = functionResource.Properties ?? {};
    functionResource.Properties.Layers =
      functionResource.Properties.Layers ?? [];

    if (!functionResource.Properties.Layers.includes(layerArn)) {
      functionResource.Properties.Layers.push(layerArn);
    }
  }

  removeLayersFromFunctionResource(
    functionResource: CloudFormationResource,
  ): void {
    if (functionResource.Properties?.Layers) {
      functionResource.Properties.Layers =
        functionResource.Properties.Layers.filter((layer: string) => {
          return (
            typeof layer !== 'string' ||
            !layer.includes('prisma-layer')
          );
        });

      if (functionResource.Properties.Layers.length === 0) {
        delete functionResource.Properties.Layers;
      }
    }
  }

  updateLayerInFunctionResource(
    functionResource: CloudFormationResource,
    newLayerArn: string,
  ): void {
    if (functionResource.Properties?.Layers) {
      functionResource.Properties.Layers =
        functionResource.Properties.Layers.map((layer: string) => {
          if (
            typeof layer === 'string' &&
            layer.includes('prisma-layer') &&
            layer.endsWith(':1')
          ) {
            return newLayerArn;
          }
          return layer;
        });
    }
  }
}

export default CloudFormationManager;
