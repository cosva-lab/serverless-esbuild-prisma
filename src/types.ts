export interface ServerlessInstance {
  service: {
    getFunction: (name: string) => any;
    provider: {
      region?: string;
      stage?: string;
    };
    custom?: {
      esbuildPrisma?: {
        layer?: boolean;
        layerName?: string;
        layerDescription?: string;
        prismaPath?: string;
        ignoredFunctionNames?: string[];
        esbuildOutputPath?: string;
        logging?: string | { level: string };
        debug?: boolean;
      };
    };
  };
  cli: {
    log: (message: string, entity?: string, options?: any) => void;
  };
}

export interface ServerlessOptions {
  [key: string]: any;
}

export interface ServerlessFunction {
  handler: string;
  runtime?: string;
  layers?: string[];
  environment?: { [key: string]: string };
  [key: string]: any;
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
  [engineType: string]: string[];
}
