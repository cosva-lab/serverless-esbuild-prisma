import { ServerlessInstance } from '../types';

class ConfigManager {
  private serverless: ServerlessInstance;

  constructor(serverless: ServerlessInstance) {
    this.serverless = serverless;
  }

  get service(): ServerlessInstance['service'] {
    return this.serverless.service;
  }

  getRegion() {
    return this.service.provider.region ?? 'us-east-1';
  }

  getServicePath() {
    return this.serverless.config.servicePath;
  }

  getLayerConfig(): boolean {
    return this.service.custom?.prisma?.layer ?? false;
  }

  getLayerName(): string {
    const stage = this.service.provider.stage ?? 'dev';
    return (
      this.service.custom?.prisma?.layerName ??
      `${this.service.service}-${stage}-prisma-layer`
    );
  }

  getLayerDescription(): string {
    return (
      this.service.custom?.prisma?.layerDescription ??
      'Prisma engines layer for serverless functions'
    );
  }

  getPrismaPath(): string {
    return (
      this.service.custom?.prisma?.prismaPath ?? this.getServicePath()
    );
  }

  getIgnoredFunctionNames(): string[] {
    return this.service.custom?.prisma?.ignoredFunctionNames ?? [];
  }

  getEsbuildOutputPath(): string {
    return (
      this.service.custom?.esbuild?.outputDir ?? this.getServicePath()
    );
  }

  getFunctionNamesForProcess(): string[] {
    let packageIndividually = false;
    if (this.serverless.config.configurationInput) {
      packageIndividually =
        !!this.serverless.config.configurationInput.package
          ?.individually;
    }
    return packageIndividually
      ? this.getAllNodeFunctions()
      : ['service'];
  }

  getAllNodeFunctions(): string[] {
    const functions = this.service.getAllFunctions();
    return functions.filter(funcName => {
      if (this.getIgnoredFunctionNames().includes(funcName)) {
        return false;
      }

      try {
        const func = this.service.getFunction(funcName);

        // Check if function object is valid
        if (!func || typeof func !== 'object') {
          return false;
        }

        // if `uri` is provided or simple remote image path, it means the
        // image isn't built by Serverless so we shouldn't take care of it
        if (
          ('image' in func && func.image) ||
          ('image' in func &&
            func.image &&
            typeof func.image == 'string')
        ) {
          return false;
        }

        return this.isNodeRuntime(
          func.runtime ?? this.service.provider.runtime ?? 'nodejs',
        );
      } catch {
        // If we can't access the function (e.g., during first deployment),
        // skip it to avoid null reference errors
        return false;
      }
    });
  }

  isNodeRuntime(runtime: string): boolean {
    return !!runtime.match(/node/);
  }

  getLoggingConfig(): string | { level: string } {
    return this.service.custom?.prisma?.logging ?? 'INFO';
  }

  getDebugConfig(): boolean {
    return this.service.custom?.prisma?.debug ?? false;
  }

  getServerlessInstance(): ServerlessInstance {
    return this.serverless;
  }
}

export default ConfigManager;
