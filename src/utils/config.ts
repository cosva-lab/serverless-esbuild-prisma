class ConfigManager {
  constructor(serverless) {
    this.serverless = serverless;
  }

  getRegion() {
    return this.serverless.service.provider.region || 'us-east-1';
  }

  getServicePath() {
    return this.serverless.config.servicePath;
  }

  getLayerConfig() {
    return this.serverless?.service?.custom?.prisma?.useLayer || false;
  }

  getLayerName() {
    const stage = this.serverless.service.provider.stage || 'dev';
    return (
      this.serverless?.service?.custom?.prisma?.layerName ||
      `${this.serverless.service.service}-${stage}-prisma-layer`
    );
  }

  getLayerDescription() {
    return (
      this.serverless?.service?.custom?.prisma?.layerDescription ||
      'Prisma engines layer for serverless functions'
    );
  }

  getPrismaPath() {
    return (
      this.serverless?.service?.custom?.prisma?.prismaPath ||
      this.getServicePath()
    );
  }

  getIgnoredFunctionNames() {
    return this.serverless?.service?.custom?.prisma?.ignoreFunctions || [];
  }

  getEsbuildOutputPath() {
    return (
      this.serverless?.service?.custom?.esbuild?.outputDir ||
      this.getServicePath()
    );
  }

  getFunctionNamesForProcess() {
    let packageIndividually = false;
    if ('configurationInput' in this.serverless) {
      packageIndividually =
        this.serverless.configurationInput.package &&
        this.serverless.configurationInput.package.individually;
    }
    return packageIndividually ? this.getAllNodeFunctions() : ['service'];
  }

  getAllNodeFunctions() {
    const functions = this.serverless.service.getAllFunctions();
    return functions.filter(funcName => {
      if (this.getIgnoredFunctionNames().includes(funcName)) {
        return false;
      }

      try {
        const func = this.serverless.service.getFunction(funcName);

        // Check if function object is valid
        if (!func || typeof func !== 'object') {
          return false;
        }

        // if `uri` is provided or simple remote image path, it means the
        // image isn't built by Serverless so we shouldn't take care of it
        if (
          ('image' in func && func.image) ||
          ('image' in func && func.image && typeof func.image == 'string')
        ) {
          return false;
        }

        return this.isNodeRuntime(
          func.runtime || this.serverless.service.provider.runtime || 'nodejs'
        );
      } catch (error) {
        // If we can't access the function (e.g., during first deployment),
        // skip it to avoid null reference errors
        return false;
      }
    });
  }

  isNodeRuntime(runtime) {
    return runtime.match(/node/);
  }

  getLoggingConfig() {
    return this.serverless?.service?.custom?.prisma?.logging || 'INFO';
  }

  getDebugConfig() {
    return this.serverless?.service?.custom?.prisma?.debug || false;
  }
}

module.exports = ConfigManager;
