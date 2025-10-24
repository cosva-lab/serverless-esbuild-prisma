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
    
    // Debug: Log service path and search pattern
    this.logger.debug(`Service path: ${servicePath}`);
    const searchPattern = `${servicePath}/node_modules/**/{${this.engines.join(',')}}`;
    this.logger.debug(`Search pattern: ${searchPattern}`);

    const enginePaths = glob.sync(searchPattern, { nodir: true });
    
    // Debug: Log found engine paths
    this.logger.debug(`Found engine paths: ${JSON.stringify(enginePaths, null, 2)}`);

    // If no engines found with the default pattern, try alternative patterns
    if (enginePaths.length === 0) {
      this.logger.debug('No engines found with default pattern, trying alternative patterns...');
      
      // Try without the rhel-openssl requirement for libquery_engine
      const alternativeEngines = [
        'libquery_engine*',
        'migration-engine*',
        'prisma-fmt*',
        'introspection-engine*',
      ];
      
      const alternativePattern = `${servicePath}/node_modules/**/{${alternativeEngines.join(',')}}`;
      this.logger.debug(`Alternative search pattern: ${alternativePattern}`);
      
      const alternativePaths = glob.sync(alternativePattern, { nodir: true });
      this.logger.debug(`Alternative engine paths: ${JSON.stringify(alternativePaths, null, 2)}`);
      
      if (alternativePaths.length > 0) {
        enginePaths.push(...alternativePaths);
      }
    }

    const autoDetectedEngines = {};

    enginePaths.forEach(enginePath => {
      const engineName = path.basename(enginePath);

      // Detect query engine - libquery_engine is always a library (.so.node)
      if (
        engineName.includes('libquery_engine') &&
        (engineName.includes('rhel-openssl') || engineName.endsWith('.so.node'))
      ) {
        autoDetectedEngines.queryEngineLibrary = engineName;
      }

      // Detect query engine binary (different pattern)
      if (
        engineName.includes('query-engine') &&
        !engineName.includes('libquery_engine')
      ) {
        autoDetectedEngines.queryEngineBinary = engineName;
      }

      // Detect migration engine
      if (
        engineName.includes('migration-engine') &&
        !autoDetectedEngines.migrationEngine
      ) {
        autoDetectedEngines.migrationEngine = engineName;
      }

      // Detect introspection engine
      if (
        engineName.includes('introspection-engine') &&
        !autoDetectedEngines.introspectionEngine
      ) {
        autoDetectedEngines.introspectionEngine = engineName;
      }

      // Detect prisma-fmt
      if (engineName.includes('prisma-fmt') && !autoDetectedEngines.prismaFmt) {
        autoDetectedEngines.prismaFmt = engineName;
      }
    });

    this.logger.debug(
      `Auto-detected engines: ${JSON.stringify(autoDetectedEngines, null, 2)}`
    );

    // Merge user config with auto-detected engines
    // User config overrides auto-detected, but only for specified engines
    const finalEngines = {
      ...autoDetectedEngines,
      ...userConfig,
    };

    if (Object.keys(userConfig).length > 0) {
      this.logger.debug(
        `User overrides: ${JSON.stringify(userConfig, null, 2)}`
      );
      this.logger.debug(
        `Final engines: ${JSON.stringify(finalEngines, null, 2)}`
      );
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
