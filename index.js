const path = require('path');
const fs = require('fs');
const admZip = require('adm-zip');
const glob = require('glob');
const crypto = require('crypto');
const { LambdaClient, ListLayersCommand, ListLayerVersionsCommand, GetLayerVersionCommand, PublishLayerVersionCommand } = require('@aws-sdk/client-lambda');
const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
const { getSchemaWithPath } = require('@prisma/internals');

class ServerlessEsbuildPrisma {
  constructor(serverless, options) {
    this.engines = [
      'libquery_engine*rhel-openssl-*.0.x.*',
      'migration-engine*',
      'migration-engine-rhel*',
      'prisma-fmt*',
      'prisma-fmt-rhel*',
      'introspection-engine*',
      'introspection-engine-rhel*',
    ];
    this.serverless = serverless;
    this.options = options;
    this.useLayer = this.getLayerConfig();
    this.lambdaClient = new LambdaClient({ region: this.getRegion() });
    this.stsClient = new STSClient({ region: this.getRegion() });
    
    // Initialize logger
    this.logger = this.createLogger();
    
    // Flag to prevent double execution
    this.deployProcessed = false;
    this.commands = {
      esbuildprisma: {
        usage: 'Embeds the prisma schema and engine',
        lifecycleEvents: ['package'],
      },
    };
    this.hooks = {
      'after:package:createDeploymentArtifacts':
        this.onBeforePackageFinalize.bind(this),
      'before:deploy:deploy':
        this.onBeforeDeploy.bind(this),
      'before:deploy:createDeploymentArtifacts':
        this.onBeforeDeploy.bind(this),
      'before:package:initialize':
        this.onBeforePackageInitialize.bind(this),
    };
  }

  // Logger methods
  createLogger() {
    const pluginName = 'serverless-esbuild-prisma';
    const prefix = `[${pluginName}]`;
    
    return {
      log: (message, ...args) => {
        this.serverless.cli.log(`${prefix} ${message}`, ...args);
      },
      info: (message, ...args) => {
        this.serverless.cli.log(`${prefix} [INFO] ${message}`, ...args);
      },
      warn: (message, ...args) => {
        this.serverless.cli.log(`${prefix} [WARN] ${message}`, ...args);
      },
      error: (message, ...args) => {
        this.serverless.cli.log(`${prefix} [ERROR] ${message}`, ...args);
      },
      success: (message, ...args) => {
        this.serverless.cli.log(`${prefix} [SUCCESS] ${message}`, ...args);
      },
      debug: (message, ...args) => {
        if (this.serverless.service.custom?.prisma?.debug) {
          this.serverless.cli.log(`${prefix} [DEBUG] ${message}`, ...args);
        }
      }
    };
  }

  async onBeforePackageInitialize() {
    // Add layers to functions during configuration phase
    if (this.useLayer) {
      await this.addLayersToFunctions();
    }
  }

  async onBeforePackageFinalize() {
    const functionNames = this.getFunctionNamesForProcess();
    const { schemaPath } = await getSchemaWithPath();

    // During package, handle file operations and generate layer zip
    if (this.useLayer) {
      // Generate layer zip for later use during deploy
      await this.createLayerZip(schemaPath);
      this.logger.success('Layer zip generated for deployment');
    }

    for (const functionName of functionNames) {
      if (this.useLayer) {
        this.writePrismaSchemaToZip(functionName, { prismaSchema: schemaPath });
      } else {
        this.writePrismaSchemaAndEngineToZip(functionName, {
          prismaSchema: schemaPath,
        });
      }
    }
  }

  async onBeforeDeploy() {
    if (!this.useLayer) {
      return; // Skip layer operations if not using layers
    }

    if (this.deployProcessed) {
      this.logger.debug('Deploy process already executed, skipping');
      return;
    }

    this.logger.info('Starting Prisma layer deployment process');
    
    const { schemaPath } = await getSchemaWithPath();
    const layerZipPath = await this.createLayerZip(schemaPath);
    
    // Handle layer deployment first
    await this.handleLayerDeploymentFromZip(layerZipPath);
    
    // Then update function configurations with the actual layer ARN
    await this.updateFunctionLayersAfterDeployment();
    
    this.deployProcessed = true;
    this.logger.success('Prisma layer deployment process completed');
  }
  writePrismaSchemaAndEngineToZip(functionName, { prismaSchema }) {
    const fn = this.serverless.service.getFunction(functionName);

    const servicePath = this.getServicePath();
    const enginePaths = glob.sync(
      `${servicePath}/node_modules/**/{${this.engines.join(',')}}`,
      { nodir: true }
    );
    if ('handler' in fn) {
      // is Serverless.FunctionDefinitionHandler
      const splitFunctionPath = fn.handler?.split('/');
      splitFunctionPath.pop();
      const functionPath = splitFunctionPath.join('/');
      const zipFileName = path.join('./.serverless/', functionName + '.zip');
      let zip = new admZip(fs.readFileSync(zipFileName));
      const prismaFileName = path.basename(prismaSchema);
      zip.addFile(
        `${functionPath}/${prismaFileName}`,
        fs.readFileSync(prismaSchema)
      );
      enginePaths.forEach(enginePath => {
        zip.addFile(
          `${functionPath}/${path.basename(enginePath)}`,
          fs.readFileSync(enginePath)
        );
      });
      zip.writeZip(zipFileName);
    }
  }
  writePrismaSchemaToZip(functionName, { prismaSchema }) {
    const fn = this.serverless.service.getFunction(functionName);

    if ('handler' in fn) {
      // is Serverless.FunctionDefinitionHandler
      const splitFunctionPath = fn.handler?.split('/');
      splitFunctionPath.pop();
      const functionPath = splitFunctionPath.join('/');
      const zipFileName = path.join('./.serverless/', functionName + '.zip');
      let zip = new admZip(fs.readFileSync(zipFileName));
      const prismaFileName = path.basename(prismaSchema);
      zip.addFile(
        `${functionPath}/${prismaFileName}`,
        fs.readFileSync(prismaSchema)
      );
      zip.writeZip(zipFileName);
    }
  }
  getFunctionNamesForProcess() {
    let packageIndividually = false;
    if ('configurationInput' in this.serverless) {
      // is Serverless
      packageIndividually =
        this.serverless.configurationInput.package &&
        this.serverless.configurationInput.package.individually;
    }
    return packageIndividually ? this.getAllNodeFunctions() : ['service'];
  }
  getPrismaPath() {
    return (
      this.serverless?.service?.custom?.prisma?.prismaPath || getServicePath()
    );
  }
  getIgnoredFunctionNames() {
    return this.serverless?.service?.custom?.prisma?.ignoreFunctions || [];
  }
  getEsbuildOutputPath() {
    return (
      this.serverless?.service?.custom?.esbuild?.outputDir || getServicePath()
    );
  }

  getServicePath() {
    return this.serverless.config.servicePath;
  }
  // Ref: https://github.com/serverless-heaven/serverless-esbuild/blob/4785eb5e5520c0ce909b8270e5338ef49fab678e/lib/utils.js#L115
  getAllNodeFunctions() {
    const functions = this.serverless.service.getAllFunctions();
    return functions.filter(funcName => {
      if (this.getIgnoredFunctionNames().includes(funcName)) {
        return false;
      }
      const func = this.serverless.service.getFunction(funcName);
      // if `uri` is provided or simple remote image path, it means the
      // image isn't built by Serverless so we shouldn't take care of it
      // @ts-ignore
      if (
        ('image' in func && func.image) /*&& func.image.uri*/ ||
        ('image' in func && func.image && typeof func.image == 'string')
      ) {
        return false;
      }
      return this.isNodeRuntime(
        func.runtime || this.serverless.service.provider.runtime || 'nodejs'
      );
    });
  }
  isNodeRuntime(runtime) {
    return runtime.match(/node/);
  }

  // Layer configuration methods
  getLayerConfig() {
    return this.serverless?.service?.custom?.prisma?.useLayer || false;
  }

  getRegion() {
    return this.serverless.service.provider.region || 'us-east-1';
  }

  async getAccountId() {
    try {
      const command = new GetCallerIdentityCommand({});
      const result = await this.stsClient.send(command);
      return result.Account;
    } catch (error) {
      this.serverless.cli.log(`Error getting account ID: ${error.message}`);
      // Fallback to a placeholder if we can't get the real account ID
      return '123456789012';
    }
  }

  getLayerName() {
    const stage = this.serverless.service.provider.stage || 'dev';
    return this.serverless?.service?.custom?.prisma?.layerName || 
           `${this.serverless.service.service}-${stage}-prisma-layer`;
  }

  getLayerDescription() {
    return this.serverless?.service?.custom?.prisma?.layerDescription || 
           'Prisma engines layer for serverless functions';
  }

  // Layer deployment methods
  async handleLayerDeployment(schemaPath) {
    const layerName = this.getLayerName();
    const layerDescription = this.getLayerDescription();
    
    this.serverless.cli.log(`Processing Prisma layer: ${layerName}`);
    
    // Create layer zip with engines
    const layerZipPath = await this.createLayerZip(schemaPath);
    
    await this.handleLayerDeploymentFromZip(layerZipPath);
    
    // Clean up temporary zip file
    if (fs.existsSync(layerZipPath)) {
      fs.unlinkSync(layerZipPath);
    }
  }

  async handleLayerDeploymentFromZip(layerZipPath) {
    const layerName = this.getLayerName();
    const layerDescription = this.getLayerDescription();
    
    this.logger.info(`Processing Prisma layer: ${layerName}`);
    
    // Check if layer exists and if content has changed
    const layerExists = await this.layerExists(layerName);
    const needsUpdate = layerExists ? await this.layerNeedsUpdate(layerZipPath, layerName) : true;
    
    if (needsUpdate) {
      await this.uploadLayer(layerZipPath, layerName, layerDescription);
      this.logger.success('Layer uploaded successfully');
    } else {
      this.logger.info('Layer content unchanged, skipping upload');
    }
  }

  async createLayerZip(schemaPath) {
    const servicePath = this.getServicePath();
    const enginePaths = glob.sync(
      `${servicePath}/node_modules/**/{${this.engines.join(',')}}`,
      { nodir: true }
    );
    
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
      // Get current layer version
      const command = new ListLayerVersionsCommand({ LayerName: layerName });
      const result = await this.lambdaClient.send(command);
      if (result.LayerVersions.length === 0) {
        return true;
      }
      
      const latestVersion = result.LayerVersions[0];
      
      // Calculate hash based on actual content, not zip file
      const { schemaPath } = await getSchemaWithPath();
      const newLayerHash = this.calculateLayerContentHash(schemaPath);
      
      // Get current layer content hash from description
      const currentLayerHash = await this.getCurrentLayerHash(layerName, latestVersion.Version);
      
      this.logger.debug(`Content hash comparison: new=${newLayerHash.substring(0, 8)}... current=${currentLayerHash ? currentLayerHash.substring(0, 8) + '...' : 'none'}`);
      
      return newLayerHash !== currentLayerHash;
    } catch (error) {
      this.logger.error(`Error checking layer update: ${error.message}`);
      return true; // Default to updating if we can't determine
    }
  }

  calculateFileHash(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  calculateLayerContentHash(schemaPath) {
    const servicePath = this.getServicePath();
    const enginePaths = glob.sync(
      `${servicePath}/node_modules/**/{${this.engines.join(',')}}`,
      { nodir: true }
    );
    
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
      
      // Try to get hash from description
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
      
      // Calculate hash based on content, not zip file
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

  async addLayersToFunctions() {
    try {
      const layerName = this.getLayerName();
      this.logger.info(`Adding layers to functions for layer: ${layerName}`);
      
      // Try to get the latest layer version
      let layerArn = null;
      try {
        const command = new ListLayerVersionsCommand({ LayerName: layerName });
        const result = await this.lambdaClient.send(command);
        
        if (result.LayerVersions.length > 0) {
          const latestVersion = result.LayerVersions[0];
          layerArn = latestVersion.LayerArn || 
            `arn:aws:lambda:${this.getRegion()}:${await this.getAccountId()}:layer:${layerName}:${latestVersion.Version}`;
          this.logger.info(`Found existing layer: ${layerArn}`);
        } else {
          this.logger.info('No existing layer found, will create during deployment');
          // Create a placeholder ARN that will be updated during deployment
          layerArn = `arn:aws:lambda:${this.getRegion()}:${await this.getAccountId()}:layer:${layerName}:LATEST`;
        }
      } catch (error) {
        this.logger.debug(`Layer doesn't exist yet, will create during deployment: ${error.message}`);
        // Create a placeholder ARN that will be updated during deployment
        layerArn = `arn:aws:lambda:${this.getRegion()}:${await this.getAccountId()}:layer:${layerName}:LATEST`;
      }
      
      // Use the shared method to update functions
      await this.updateFunctionsWithLayer(layerArn, 'Added layer to function');
    } catch (error) {
      this.logger.error(`Error adding layers to functions: ${error.message}`);
      // Don't throw error to avoid breaking the configuration phase
    }
  }

  async updateFunctionsWithLayer(layerArn, logMessage, removePlaceholders = false) {
    const functionNames = this.getFunctionNamesForProcess();
    
    for (const functionName of functionNames) {
      const fn = this.serverless.service.getFunction(functionName);
      
      if ('handler' in fn) {
        // Add layer to function configuration
        if (!fn.layers) {
          fn.layers = [];
        }
        
        // Remove any existing prisma layers
        fn.layers = fn.layers.filter(layer => {
          if (typeof layer === 'string') {
            if (removePlaceholders) {
              return !layer.includes('prisma-layer') && !layer.includes('LATEST');
            } else {
              return !layer.includes('prisma-layer');
            }
          }
          return true;
        });
        
        // Add the new layer
        fn.layers.push(layerArn);
        
        // Set environment variables for Prisma to find engines in the layer
        if (!fn.environment) {
          fn.environment = {};
        }
        
        // Set Prisma engine path to look in the layer
        fn.environment.PRISMA_QUERY_ENGINE_LIBRARY = '/opt/nodejs/libquery_engine-rhel-openssl-3.0.x.so.node';
        fn.environment.PRISMA_QUERY_ENGINE_BINARY = '/opt/nodejs/libquery_engine-rhel-openssl-3.0.x.so.node';
        fn.environment.PRISMA_MIGRATION_ENGINE_BINARY = '/opt/nodejs/migration-engine';
        fn.environment.PRISMA_INTROSPECTION_ENGINE_BINARY = '/opt/nodejs/introspection-engine';
        fn.environment.PRISMA_FMT_BINARY = '/opt/nodejs/prisma-fmt';
        
        this.logger.success(`${logMessage} ${functionName}: ${layerArn}`);
      }
    }
  }

  async updateFunctionLayersAfterDeployment() {
    try {
      const layerName = this.getLayerName();
      
      // Get the latest layer version that was just created
      const command = new ListLayerVersionsCommand({ LayerName: layerName });
      const result = await this.lambdaClient.send(command);
      
      if (result.LayerVersions.length === 0) {
        this.logger.warn('No layer versions found after deployment');
        return;
      }
      
      const latestVersion = result.LayerVersions[0];
      const layerArn = latestVersion.LayerArn || 
        `arn:aws:lambda:${this.getRegion()}:${await this.getAccountId()}:layer:${layerName}:${latestVersion.Version}`;
      
      this.logger.info(`Using deployed layer ARN: ${layerArn}`);
      
      // Use the shared method to update functions
      await this.updateFunctionsWithLayer(layerArn, 'Updated function', true);
    } catch (error) {
      this.logger.error(`Error updating function layers after deployment: ${error.message}`);
      throw error;
    }
  }

  async updateFunctionLayers(layerName) {
    try {
      // Get the latest layer version
      const command = new ListLayerVersionsCommand({ LayerName: layerName });
      const result = await this.lambdaClient.send(command);
      if (result.LayerVersions.length === 0) {
        throw new Error('Layer not found');
      }
      
      const latestVersion = result.LayerVersions[0];
      
      // Construct the layer ARN manually if LayerArn is undefined
      const region = this.getRegion();
      const accountId = await this.getAccountId();
      const layerArn = latestVersion.LayerArn || 
        `arn:aws:lambda:${region}:${accountId}:layer:${layerName}:${latestVersion.Version}`;
      
      this.logger.info(`Layer ARN: ${layerArn}`);
      
      // Use the shared method to update functions
      await this.updateFunctionsWithLayer(layerArn, 'Updated function');
    } catch (error) {
      this.logger.error(`Error updating function layers: ${error.message}`);
      throw error;
    }
  }
}
module.exports = ServerlessEsbuildPrisma;
