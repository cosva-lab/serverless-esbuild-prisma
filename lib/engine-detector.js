const glob = require('glob');
const path = require('path');

class EngineDetector {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.engines = [
      'libquery_engine*rhel-openssl-*.0.x.*',
      'migration-engine*',
      'migration-engine-rhel*',
      'prisma-fmt*',
      'prisma-fmt-rhel*',
      'introspection-engine*',
      'introspection-engine-rhel*',
    ];
  }

  getUserEngineConfig() {
    return this.config.serverless?.service?.custom?.prisma?.engines || {};
  }

  detectAvailableEngines() {
    const userConfig = this.getUserEngineConfig();
    
    // Always auto-detect engines first
    const servicePath = this.config.getServicePath();
    
    const enginePaths = glob.sync(
      `${servicePath}/node_modules/**/{${this.engines.join(',')}}`,
      { nodir: true }
    );
    
    const autoDetectedEngines = {};
    
    enginePaths.forEach(enginePath => {
      const engineName = path.basename(enginePath);
      
      // Detect query engine - libquery_engine is always a library (.so.node)
      if (engineName.includes('libquery_engine') && engineName.includes('rhel-openssl')) {
        autoDetectedEngines.queryEngineLibrary = engineName;
      }
      
      // Detect query engine binary (different pattern)
      if (engineName.includes('query-engine') && !engineName.includes('libquery_engine')) {
        autoDetectedEngines.queryEngineBinary = engineName;
      }
      
      // Detect migration engine
      if (engineName.includes('migration-engine') && !autoDetectedEngines.migrationEngine) {
        autoDetectedEngines.migrationEngine = engineName;
      }
      
      // Detect introspection engine
      if (engineName.includes('introspection-engine') && !autoDetectedEngines.introspectionEngine) {
        autoDetectedEngines.introspectionEngine = engineName;
      }
      
      // Detect prisma-fmt
      if (engineName.includes('prisma-fmt') && !autoDetectedEngines.prismaFmt) {
        autoDetectedEngines.prismaFmt = engineName;
      }
    });
    
    this.logger.debug(`Auto-detected engines: ${JSON.stringify(autoDetectedEngines, null, 2)}`);
    
    // Merge user config with auto-detected engines
    // User config overrides auto-detected, but only for specified engines
    const finalEngines = {
      ...autoDetectedEngines,
      ...userConfig
    };
    
    if (Object.keys(userConfig).length > 0) {
      this.logger.debug(`User overrides: ${JSON.stringify(userConfig, null, 2)}`);
      this.logger.debug(`Final engines: ${JSON.stringify(finalEngines, null, 2)}`);
    }
    
    return finalEngines;
  }

  getEnginePaths() {
    const servicePath = this.config.getServicePath();
    
    // Always use default patterns to find all engines
    // The detectAvailableEngines method will handle user overrides
    return glob.sync(
      `${servicePath}/node_modules/**/{${this.engines.join(',')}}`,
      { nodir: true }
    );
  }

  getEnginesList() {
    return this.engines;
  }
}

module.exports = EngineDetector;
