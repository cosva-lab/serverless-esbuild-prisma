const path = require('path');
const fs = require('fs');
const admZip = require('adm-zip');
const get = require('lodash.get');
const glob = require('glob');
const { getSchemaWithPath } = require('@prisma/internals');

class ServerlessEsbuildPrisma {
  constructor(serverless, options) {
    this.engines = [
      'libquery_engine*',
      'libquery_engine-rhel*',
      'libquery_engine*',
      'libquery_engine-rhel*',
      'libquery_engine*',
      'libquery_engine-rhel*',
      'migration-engine*',
      'migration-engine-rhel*',
      'prisma-fmt*',
      'prisma-fmt-rhel*',
      'introspection-engine*',
      'introspection-engine-rhel*',
    ];
    this.serverless = serverless;
    this.options = options;
    this.commands = {
      esbuildprisma: {
        usage: 'Embeds the prisma schema and engine',
        lifecycleEvents: ['package'],
      },
    };
    this.hooks = {
      'after:package:createDeploymentArtifacts':
        this.onBeforePackageFinalize.bind(this),
    };
  }
  async onBeforePackageFinalize() {
    const functionNames = this.getFunctionNamesForProcess();
    const schemaPath = (await getSchemaWithPath()).schemaPath;
    for (const functionName of functionNames) {
      this.writePrismaSchemaAndEngineToZip(functionName, {
        schemaPath,
      });
    }
  }
  writePrismaSchemaAndEngineToZip(functionName, { schemaPath }) {
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
      zip.addFile(`${functionPath}/schema.prisma`, fs.readFileSync(schemaPath));
      enginePaths.forEach(enginePath => {
        zip.addFile(
          `${functionPath}/${path.basename(enginePath)}`,
          fs.readFileSync(enginePath)
        );
      });
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
    return get(
      this.serverless,
      'service.custom.prisma.prismaPath',
      getServicePath()
    );
  }
  getIgnoredFunctionNames() {
    return get(this.serverless, 'service.custom.prisma.ignoreFunctions', []);
  }
  getEsbuildOutputPath() {
    return get(
      this.serverless,
      'service.custom.esbuild.outputDir',
      getServicePath()
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
}
module.exports = ServerlessEsbuildPrisma;
