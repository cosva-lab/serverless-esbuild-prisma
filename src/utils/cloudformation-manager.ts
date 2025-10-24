class CloudFormationManager {
  constructor(serverless, config, logger) {
    this.serverless = serverless;
    this.config = config;
    this.logger = logger;
  }

  async addLayersToTemplate(layerArn) {
    await this.modifyTemplate('add', layerArn);
  }

  async removeLayersFromTemplate() {
    await this.modifyTemplate('remove', null);
  }

  async updateLayersInTemplate(newLayerArn) {
    await this.modifyTemplate('update', newLayerArn);
  }

  async modifyTemplate(operation, layerArn) {
    try {
      const compiledTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;
      
      if (!compiledTemplate) {
        this.logger.warn('No compiled CloudFormation template found');
        return;
      }

      const functionNames = this.config.getFunctionNamesForProcess();
      
      for (const functionName of functionNames) {
        const functionLogicalId = this.serverless.providers.aws.naming.getLambdaLogicalId(functionName);
        
        if (compiledTemplate.Resources[functionLogicalId]) {
          const functionResource = compiledTemplate.Resources[functionLogicalId];
          
          if (operation === 'add') {
            this.addLayerToFunctionResource(functionResource, functionLogicalId, layerArn);
          } else if (operation === 'remove') {
            this.removeLayersFromFunctionResource(functionResource, functionLogicalId);
          } else if (operation === 'update') {
            this.updateLayerInFunctionResource(functionResource, functionLogicalId, layerArn);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error modifying CloudFormation template: ${error.message}`);
      throw error;
    }
  }

  addLayerToFunctionResource(functionResource, functionLogicalId, layerArn) {
    functionResource.Properties = functionResource.Properties || {};
    functionResource.Properties.Layers = functionResource.Properties.Layers || [];
    
    if (!functionResource.Properties.Layers.includes(layerArn)) {
      functionResource.Properties.Layers.push(layerArn);
    }
  }

  removeLayersFromFunctionResource(functionResource, functionLogicalId) {
    if (functionResource.Properties && functionResource.Properties.Layers) {
      functionResource.Properties.Layers = functionResource.Properties.Layers.filter(layer => {
        return typeof layer !== 'string' || !layer.includes('prisma-layer');
      });
      
      if (functionResource.Properties.Layers.length === 0) {
        delete functionResource.Properties.Layers;
      }
    }
  }

  updateLayerInFunctionResource(functionResource, functionLogicalId, newLayerArn) {
    if (functionResource.Properties && functionResource.Properties.Layers) {
      functionResource.Properties.Layers = functionResource.Properties.Layers.map(layer => {
        if (typeof layer === 'string' && layer.includes('prisma-layer') && layer.endsWith(':1')) {
          return newLayerArn;
        }
        return layer;
      });
    }
  }
}

module.exports = CloudFormationManager;
