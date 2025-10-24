const path = require('path');
const fs = require('fs');
const admZip = require('adm-zip');
const crypto = require('crypto');
const { LambdaClient, ListLayersCommand, ListLayerVersionsCommand, GetLayerVersionCommand, PublishLayerVersionCommand } = require('@aws-sdk/client-lambda');
const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
const { getSchemaWithPath } = require('@prisma/internals');
const EngineDetector = require('./engine-detector');

class LayerManager {
  constructor(serverless, config, logger) {
    this.serverless = serverless;
    this.config = config;
    this.logger = logger;
    this.lambdaClient = new LambdaClient({ region: config.getRegion() });
    this.stsClient = new STSClient({ region: config.getRegion() });
    this.engineDetector = new EngineDetector(config, logger);
  }

  async getAccountId() {
    try {
      const command = new GetCallerIdentityCommand({});
      const result = await this.stsClient.send(command);
      return result.Account;
    } catch (error) {
      this.logger.error(`Error getting account ID: ${error.message}`);
      return '123456789012';
    }
  }

  async createLayerZip(schemaPath) {
    const enginePaths = this.engineDetector.getEnginePaths();
    
    const layerZipPath = path.join('./.serverless/', 'prisma-layer.zip');
    const zip = new admZip();
    
    // Add engines to layer
    enginePaths.forEach(enginePath => {
      const engineName = path.basename(enginePath);
      zip.addFile(`nodejs/${engineName}`, fs.readFileSync(enginePath));
    });
    
    // Add schema to layer
    const prismaFileName = path.basename(schemaPath);
    zip.addFile(`nodejs/${prismaFileName}`, fs.readFileSync(schemaPath));
    
    zip.writeZip(layerZipPath);
    return layerZipPath;
  }

  async layerExists(layerName) {
    try {
      const command = new ListLayersCommand({});
      const result = await this.lambdaClient.send(command);
      return result.Layers.some(layer => layer.LayerName === layerName);
    } catch (error) {
      this.logger.error(`Error checking if layer exists: ${error.message}`);
      return false;
    }
  }

  async layerNeedsUpdate(layerZipPath, layerName) {
    try {
      const command = new ListLayerVersionsCommand({ LayerName: layerName });
      const result = await this.lambdaClient.send(command);
      if (result.LayerVersions.length === 0) {
        return true;
      }
      
      const latestVersion = result.LayerVersions[0];
      const { schemaPath } = await getSchemaWithPath();
      const newLayerHash = this.calculateLayerContentHash(schemaPath);
      const currentLayerHash = await this.getCurrentLayerHash(layerName, latestVersion.Version);
      
      this.logger.debug(`Content hash comparison: new=${newLayerHash.substring(0, 8)}... current=${currentLayerHash ? currentLayerHash.substring(0, 8) + '...' : 'none'}`);
      
      return newLayerHash !== currentLayerHash;
    } catch (error) {
      this.logger.error(`Error checking layer update: ${error.message}`);
      return true;
    }
  }

  calculateLayerContentHash(schemaPath) {
    const enginePaths = this.engineDetector.getEnginePaths();
    
    const hash = crypto.createHash('sha256');
    
    // Add schema content
    const schemaContent = fs.readFileSync(schemaPath);
    hash.update(schemaContent);
    
    // Add engine contents (sorted for consistency)
    enginePaths.sort().forEach(enginePath => {
      const engineContent = fs.readFileSync(enginePath);
      hash.update(engineContent);
    });
    
    return hash.digest('hex');
  }

  async getCurrentLayerHash(layerName, version) {
    try {
      const command = new GetLayerVersionCommand({ 
        LayerName: layerName, 
        VersionNumber: version 
      });
      const result = await this.lambdaClient.send(command);
      
      if (result.Description && result.Description.includes('hash:')) {
        const match = result.Description.match(/hash:([a-f0-9]+)/);
        return match ? match[1] : null;
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  async uploadLayer(layerZipPath, layerName, layerDescription) {
    try {
      const layerContent = fs.readFileSync(layerZipPath);
      const { schemaPath } = await getSchemaWithPath();
      const layerHash = this.calculateLayerContentHash(schemaPath);
      
      const command = new PublishLayerVersionCommand({
        LayerName: layerName,
        Description: `${layerDescription} (hash:${layerHash})`,
        Content: {
          ZipFile: layerContent
        },
        CompatibleRuntimes: ['nodejs18.x', 'nodejs20.x', 'nodejs22.x']
      });
      
      const result = await this.lambdaClient.send(command);
      this.logger.success(`Layer uploaded successfully: ${layerName}:${result.Version} (hash: ${layerHash.substring(0, 8)}...)`);
      
      return result;
    } catch (error) {
      this.logger.error(`Error uploading layer: ${error.message}`);
      throw error;
    }
  }

  async handleLayerDeploymentFromZip(layerZipPath) {
    const layerName = this.config.getLayerName();
    const layerDescription = this.config.getLayerDescription();
    
    this.logger.info(`Processing Prisma layer: ${layerName}`);
    
    const layerExists = await this.layerExists(layerName);
    const needsUpdate = layerExists ? await this.layerNeedsUpdate(layerZipPath, layerName) : true;
    
    if (needsUpdate) {
      await this.uploadLayer(layerZipPath, layerName, layerDescription);
      this.logger.success('Layer uploaded successfully');
    } else {
      this.logger.info('Layer content unchanged, skipping upload');
    }
  }

  async getLatestLayerArn(layerName) {
    try {
      const command = new ListLayerVersionsCommand({ LayerName: layerName });
      const result = await this.lambdaClient.send(command);
      
      if (result.LayerVersions.length > 0) {
        const latestVersion = result.LayerVersions[0];
        return latestVersion.LayerArn || 
          `arn:aws:lambda:${this.config.getRegion()}:${await this.getAccountId()}:layer:${layerName}:${latestVersion.Version}`;
      }
      return null;
    } catch (error) {
      this.logger.debug(`Layer doesn't exist yet: ${error.message}`);
      return null;
    }
  }
}

module.exports = LayerManager;
