const path = require('path');
const fs = require('fs');
const admZip = require('adm-zip');
const { getSchemaWithPath } = require('@prisma/internals');
const EngineDetector = require('./engine-detector');

class FunctionManager {
  constructor(serverless, config, logger) {
    this.serverless = serverless;
    this.config = config;
    this.logger = logger;
    this.engineDetector = new EngineDetector(config, logger);
  }

  async updateFunctionsWithLayer(
    layerArn,
    logMessage,
    removePlaceholders = false
  ) {
    const functionNames = this.config.getFunctionNamesForProcess();

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
              return (
                !layer.includes('prisma-layer') && !layer.includes('LATEST')
              );
            } else {
              return !layer.includes('prisma-layer');
            }
          }
          return true;
        });

        // Add the new layer
        fn.layers.push(layerArn);

        // Set environment variables for Prisma to find engines in the layer
        this.setPrismaEnvironmentVariables(fn);

        this.logger.success(`${logMessage} ${functionName}: ${layerArn}`);
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
    const fn = this.serverless.service.getFunction(functionName);
    const enginePaths = this.engineDetector.getEnginePaths();

    if ('handler' in fn) {
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
}

module.exports = FunctionManager;
