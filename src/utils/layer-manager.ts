import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import crypto from 'crypto';
import {
  LambdaClient,
  ListLayersCommand,
  ListLayerVersionsCommand,
  GetLayerVersionCommand,
  PublishLayerVersionCommand,
} from '@aws-sdk/client-lambda';
import {
  STSClient,
  GetCallerIdentityCommand,
} from '@aws-sdk/client-sts';
import EngineDetector from './engine-detector';
import { ServerlessInstance } from '../types';
import ConfigManager from './config';
import Logger from './logger';

class LayerManager {
  private serverless: ServerlessInstance;
  private config: ConfigManager;
  private logger: Logger;
  private lambdaClient: LambdaClient;
  private stsClient: STSClient;
  private engineDetector: EngineDetector;

  constructor(
    serverless: ServerlessInstance,
    config: ConfigManager,
    logger: Logger,
  ) {
    this.serverless = serverless;
    this.config = config;
    this.logger = logger;
    this.lambdaClient = new LambdaClient({
      region: config.getRegion(),
    });
    this.stsClient = new STSClient({ region: config.getRegion() });
    this.engineDetector = new EngineDetector(config, logger);
  }

  async getAccountId() {
    try {
      const command = new GetCallerIdentityCommand({});
      const result = await this.stsClient.send(command);
      return result.Account;
    } catch (error) {
      this.logger.error(
        `Error getting account ID: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return '123456789012';
    }
  }

  async createLayerZip(): Promise<string> {
    const enginePaths = this.engineDetector.getEnginePaths();

    const layerZipPath = path.join(
      './.serverless/',
      'prisma-layer.zip',
    );
    const zip = new AdmZip();

    // Add engines to layer
    enginePaths.forEach(enginePath => {
      const engineName = path.basename(enginePath);
      zip.addFile(
        `nodejs/${engineName}`,
        fs.readFileSync(enginePath),
      );
    });

    zip.writeZip(layerZipPath);
    return layerZipPath;
  }

  async layerExists(layerName: string) {
    try {
      const command = new ListLayersCommand({});
      const result = await this.lambdaClient.send(command);
      return !!result.Layers?.some(
        layer => layer.LayerName === layerName,
      );
    } catch (error) {
      this.logger.error(
        `Error checking if layer exists: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  async layerNeedsUpdate(
    layerZipPath: string,
    layerName: string,
  ): Promise<boolean> {
    try {
      const command = new ListLayerVersionsCommand({
        LayerName: layerName,
      });
      const result = await this.lambdaClient.send(command);
      const layerVersions = result.LayerVersions;
      if (!layerVersions || layerVersions.length === 0) {
        return true;
      }

      const latestVersion = layerVersions[0];
      const newLayerHash = this.calculateLayerContentHash();
      const currentLayerHash = await this.getCurrentLayerHash(
        layerName,
        latestVersion.Version ?? 1,
      );

      this.logger.debug(
        `Content hash comparison: new=${newLayerHash.substring(
          0,
          8,
        )}... current=${
          currentLayerHash
            ? `${currentLayerHash.substring(0, 8)}...`
            : 'none'
        }`,
      );

      return newLayerHash !== currentLayerHash;
    } catch (error) {
      this.logger.error(
        `Error checking layer update: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return true;
    }
  }

  calculateLayerContentHash() {
    const enginePaths = this.engineDetector.getEnginePaths();

    const hash = crypto.createHash('sha256');

    // Add engine contents only - engines are what determine if layer needs update
    enginePaths.sort().forEach(enginePath => {
      const engineContent = fs.readFileSync(enginePath);
      hash.update(engineContent);
    });

    this.logger.debug(
      `Calculated hash for ${enginePaths.length} engines`,
    );

    return hash.digest('hex');
  }

  async getCurrentLayerHash(
    layerName: string,
    version: number,
  ): Promise<string | null> {
    try {
      const command = new GetLayerVersionCommand({
        LayerName: layerName,
        VersionNumber: version,
      });
      const result = await this.lambdaClient.send(command);

      if (result.Description?.includes('hash:')) {
        const match = result.Description.match(/hash:([a-f0-9]+)/);
        return match ? match[1] : null;
      }

      return null;
    } catch {
      return null;
    }
  }

  async uploadLayer(
    layerZipPath: string,
    layerName: string,
    layerDescription: string,
  ) {
    try {
      const layerContent = fs.readFileSync(layerZipPath);
      const layerHash = this.calculateLayerContentHash();

      const command = new PublishLayerVersionCommand({
        LayerName: layerName,
        Description: `${layerDescription} (hash:${layerHash})`,
        Content: {
          ZipFile: layerContent,
        },
        CompatibleRuntimes: [
          'nodejs18.x',
          'nodejs20.x',
          'nodejs22.x',
        ],
      });

      const result = await this.lambdaClient.send(command);
      this.logger.success(
        `Layer uploaded successfully: ${layerName}:${
          result.Version
        } (hash: ${layerHash.substring(0, 8)}...)`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Error uploading layer: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  async handleLayerDeploymentFromZip(
    layerZipPath: string,
  ): Promise<void> {
    const layerName = this.config.getLayerName();
    const layerDescription = this.config.getLayerDescription();

    this.logger.info(`Processing Prisma layer: ${layerName}`);

    const layerExists = await this.layerExists(layerName);
    const needsUpdate = layerExists
      ? await this.layerNeedsUpdate(layerZipPath, layerName)
      : true;

    if (needsUpdate) {
      await this.uploadLayer(
        layerZipPath,
        layerName,
        layerDescription,
      );
      this.logger.success('Layer uploaded successfully');
    } else {
      this.logger.info('Layer content unchanged, skipping upload');
    }
  }

  async getLatestLayerArn(layerName: string): Promise<string | null> {
    try {
      const command = new ListLayerVersionsCommand({
        LayerName: layerName,
      });
      const result = await this.lambdaClient.send(command);

      const layerVersions = result.LayerVersions;
      if (layerVersions && layerVersions.length > 0) {
        const latestVersion = layerVersions[0];
        return (
          latestVersion.LayerVersionArn ??
          `arn:aws:lambda:${this.config.getRegion()}:${await this.getAccountId()}:layer:${layerName}:${
            latestVersion.Version
          }`
        );
      }
      return null;
    } catch (error) {
      this.logger.debug(
        `Layer doesn't exist yet: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}

export default LayerManager;
