const path = require('path');
const fs = require('fs');
const admZip = require('adm-zip');
const EngineDetector = require('./engine-detector');

class FunctionManager {
  constructor(serverless, config, logger) {
    this.serverless = serverless;
    this.config = config;
    this.logger = logger;
    this.engineDetector = new EngineDetector(config, logger);
  }

  async updateFunctionsWithLayer(layerArn, logMessage, removePlaceholders = false) {
    const functionNames = this.config.getFunctionNamesForProcess();

    for (const functionName of functionNames) {
      try {
        const fn = this.serverless.service.getFunction(functionName);

        if (!fn || typeof fn !== 'object' || !('handler' in fn)) {
          continue;
        }

        // Initialize layers array if needed
        if (!fn.layers) {
          fn.layers = [];
        }

        // Remove existing Prisma layers
        fn.layers = fn.layers.filter(layer => {
          if (typeof layer === 'string') {
            if (removePlaceholders) {
              return !layer.includes('prisma-layer') && !layer.includes('LATEST');
            }
            return !layer.includes('prisma-layer');
          }
          return true;
        });

        // Add new layer if provided
        if (layerArn && !fn.layers.includes(layerArn)) {
          fn.layers.push(layerArn);
          this.logger.success(`${logMessage} ${functionName}: ${layerArn}`);
        }

        // Set environment variables for Prisma
        this.setPrismaEnvironmentVariables(fn);
      } catch (error) {
        this.logger.warn(`Error processing function ${functionName}: ${error.message}`);
      }
    }
  }

  setPrismaEnvironmentVariables(fn) {
    fn.environment ||= {};

    // Detect available engines dynamically
    const engines = this.engineDetector.detectAvailableEngines();

    // Set Prisma engine paths based on what we found
    // Only set the appropriate query engine type
    if (engines.queryEngineLibrary) {
      fn.environment.PRISMA_QUERY_ENGINE_LIBRARY = `/opt/nodejs/${engines.queryEngineLibrary}`;
      this.logger.debug(`Set query engine library: ${engines.queryEngineLibrary}`);
    }

    if (engines.queryEngineBinary) {
      fn.environment.PRISMA_QUERY_ENGINE_BINARY = `/opt/nodejs/${engines.queryEngineBinary}`;
      this.logger.debug(`Set query engine binary: ${engines.queryEngineBinary}`);
    }

    if (engines.migrationEngine) {
      fn.environment.PRISMA_MIGRATION_ENGINE_BINARY = `/opt/nodejs/${engines.migrationEngine}`;
      this.logger.debug(`Set migration engine: ${engines.migrationEngine}`);
    }

    if (engines.introspectionEngine) {
      fn.environment.PRISMA_INTROSPECTION_ENGINE_BINARY = `/opt/nodejs/${engines.introspectionEngine}`;
      this.logger.debug(
        `Set introspection engine: ${engines.introspectionEngine}`
      );
    }

    if (engines.prismaFmt) {
      fn.environment.PRISMA_FMT_BINARY = `/opt/nodejs/${engines.prismaFmt}`;
      this.logger.debug(`Set prisma-fmt: ${engines.prismaFmt}`);
    }
  }

  writePrismaSchemaAndEngineToZip(functionName, { prismaSchema }) {
    this.writeToZip(functionName, prismaSchema, true);
  }

  writePrismaSchemaToZip(functionName, { prismaSchema }) {
    this.writeToZip(functionName, prismaSchema, false);
  }

  writeToZip(functionName, prismaSchema, includeEngines = false) {
    try {
      const fn = this.serverless.service.getFunction(functionName);
      
      if (!fn || typeof fn !== 'object' || !('handler' in fn)) {
        return;
      }

      const splitFunctionPath = fn.handler?.split('/');
      splitFunctionPath.pop();
      const functionPath = splitFunctionPath.join('/');
      const zipFileName = path.join('./.serverless/', functionName + '.zip');
      const zip = new admZip(fs.readFileSync(zipFileName));
      const prismaFileName = path.basename(prismaSchema);
      
      // Add schema
      zip.addFile(`${functionPath}/${prismaFileName}`, fs.readFileSync(prismaSchema));
      
      // Add engines if requested
      if (includeEngines) {
        const enginePaths = this.engineDetector.getEnginePaths();
        enginePaths.forEach(enginePath => {
          zip.addFile(`${functionPath}/${path.basename(enginePath)}`, fs.readFileSync(enginePath));
        });
      }
      
      zip.writeZip(zipFileName);
    } catch (error) {
      this.logger.warn(`Error writing to zip for function ${functionName}: ${error.message}`);
    }
  }
}

module.exports = FunctionManager;
