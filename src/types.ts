export interface ServerlessInstance {
  service: {
    getFunction: (name: string) => ServerlessFunction | undefined;
    getAllFunctions: () => string[];
    service: string;
    provider: {
      region?: string;
      stage?: string;
      runtime?: string;
      compiledCloudFormationTemplate?: CloudFormationTemplate;
    };
    custom?: {
      prisma?: {
        layer?: boolean;
        layerName?: string;
        layerDescription?: string;
        prismaPath?: string;
        ignoredFunctionNames?: string[];
        engines?: EngineConfig;
        logging?: string | { level: string };
        debug?: boolean;
      };
      esbuild?: {
        outputDir?: string;
      };
    };
  };
  config: {
    servicePath: string;
  };
  configurationInput?: {
    package?: {
      individually?: boolean;
    };
  };
  cli: {
    log: (
      message: string,
      entity?: string,
      options?: unknown,
    ) => void;
  };
  providers?: {
    aws?: {
      naming?: {
        getLambdaLogicalId: (functionName: string) => string;
      };
    };
  };
}

export interface ServerlessOptions {
  [key: string]: unknown;
}

export interface ServerlessFunction {
  handler: string;
  runtime?: string;
  layers?: string[];
  environment?: { [key: string]: string };
  [key: string]: unknown;
}

export interface Commands {
  [key: string]: {
    usage: string;
    lifecycleEvents: string[];
  };
}

export interface Hooks {
  [key: string]: () => Promise<void>;
}

export interface LayerConfig {
  prismaSchema: string;
}

export interface EngineConfig {
  queryEngineLibrary?: string[];
  queryEngineBinary?: string[];
  migrationEngine?: string[];
  introspectionEngine?: string[];
  prismaFmt?: string[];
  [engineType: string]: string[] | undefined;
}

export interface CloudFormationResource {
  Type: string;
  Properties?: {
    Layers?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface CloudFormationTemplate {
  Resources: Partial<Record<string, CloudFormationResource>>;
  [key: string]: unknown;
}
