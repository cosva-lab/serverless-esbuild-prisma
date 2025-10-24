# @cosva-lab/serverless-esbuild-prisma

`@cosva-lab/serverless-esbuild-prisma` is a Serverless plugin designed to integrate Prisma with the esbuild bundler, ensuring that the Prisma schema and engine files are correctly packaged within your deployment artifacts.

## Features

- Automatically embeds the Prisma schema and engine files into your Serverless deployment package.
- **NEW**: Support for AWS Lambda Layers to reduce package sizes and improve deployment speed.
- Supports multiple engines and runtime environments.
- Seamlessly integrates with the Serverless framework and esbuild bundler.
- Smart change detection for layers - only uploads when content changes.

## Installation

Install the package via npm:

```bash
npm install @cosva-lab/serverless-esbuild-prisma --save-dev
```

## Usage

Add the plugin to your `serverless.yml` file:

```yaml
plugins:
  - '@cosva-lab/serverless-esbuild-prisma'
```

### Configuration

You can customize the plugin's behavior by adding a `custom` block in your `serverless.yml`:

```yaml
custom:
  prisma:
    prismaPath: ./path/to/your/prisma/schema # Optional: Specify the path to your Prisma schema
    ignoreFunctions: # Optional: Specify functions to ignore
      - functionName1
      - functionName2
    # NEW: Layer configuration
    useLayer: true # Enable AWS Lambda Layers for Prisma engines
    layerName: "my-service-dev-prisma-layer" # Optional: custom layer name (includes stage)
    layerDescription: "Prisma engines for my service" # Optional: custom description
    # NEW: Logging configuration
    logging: "DEBUG" # ERROR, WARN, INFO, SUCCESS, DEBUG
    debug: true # Enable debug logging (legacy)
  esbuild:
    outputDir: ./path/to/output/dir # Optional: Specify the output directory for esbuild
```

#### Layer Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `useLayer` | boolean | `false` | Enable/disable layer usage |
| `layerName` | string | `{service}-{stage}-prisma-layer` | Custom layer name (includes stage) |
| `layerDescription` | string | `Prisma engines layer for serverless functions` | Layer description |

#### Logging Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `logging` | string | `INFO` | Log level: ERROR, WARN, INFO, SUCCESS, DEBUG |
| `debug` | boolean | `false` | Enable debug logging (legacy) |

#### Engine Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `engines` | object | `{}` | Manual engine configuration (overrides auto-detection) |

#### Manual Engine Configuration

You can manually specify engine names for specific engines, while others are auto-detected:

```yaml
custom:
  prisma:
    useLayer: true
    engines:
      queryEngineLibrary: "libquery_engine-rhel-openssl-3.0.x.so.node"
      # migrationEngine, introspectionEngine, prismaFmt will be auto-detected
```

**Hybrid Configuration**: The plugin auto-detects all engines by default, but you can override specific ones:

- ✅ **Auto-detected**: Engines not specified in config
- ✅ **User-configured**: Engines specified in config override auto-detection
- ✅ **Partial config**: Only specify the engines you want to customize

For detailed layer usage information, see [LAYER_USAGE.md](./LAYER_USAGE.md).
For detailed logging configuration, see [LOGGING_CONFIG.md](./LOGGING_CONFIG.md).

## Example

Here’s a basic example of how to use this plugin:

```yaml
service: my-service

provider:
  name: aws
  runtime: nodejs14.x

plugins:
  - '@cosva-lab/serverless-esbuild-prisma'

custom:
  prisma:
    prismaPath: ./prisma/schema.prisma
    ignoreFunctions:
      - anotherFunction
  esbuild:
    outputDir: ./build

functions:
  hello:
    handler: handler.hello
  anotherFunction:
    handler: handler.another
```

## Development

To contribute to this plugin:

1. Clone the repository.
2. Install dependencies: `npm install`
3. Make your changes and test them.
4. Submit a pull request.

