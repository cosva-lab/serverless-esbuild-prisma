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

## Layer Usage

This plugin supports using AWS Lambda Layers for Prisma engines, which can significantly reduce deployment package sizes and improve deployment speed.

### How it works

When `useLayer: true` is set:

#### During `serverless package`:
1. **Schema Only**: Only the Prisma schema is included in function packages (not engines)
2. **Layer Zip Generation**: Creates the layer zip file with Prisma engines
3. **No AWS Calls**: No network operations are performed during packaging

#### During `serverless deploy`:
1. **Layer Zip Generation**: Creates the layer zip file with Prisma engines
2. **Layer Upload**: Uses the generated layer zip to create/update the Lambda layer
3. **Change Detection**: It calculates a hash of the layer content to detect changes
4. **Smart Updates**: Only uploads a new layer version when content has actually changed
5. **Function Updates**: Automatically updates all functions to use the layer

### Workflow

#### Package Phase (`serverless package`)
- ✅ Only includes Prisma schema in function packages
- ✅ Generates layer zip file with Prisma engines
- ✅ No AWS API calls
- ✅ Fast and offline operation
- ✅ Perfect for CI/CD pipelines

#### Deploy Phase (`serverless deploy`)
- ✅ Generates layer zip file with Prisma engines
- ✅ Creates/updates Lambda layer using the generated zip
- ✅ Detects changes and only uploads when needed
- ✅ Updates function configurations to use layer
- ✅ Handles AWS operations
- ✅ Works independently (no need to run package first)

### Benefits

- **Smaller Packages**: Function packages are much smaller without Prisma engines
- **Faster Deployments**: Engines are cached in the layer, reducing upload time
- **Shared Resources**: Multiple functions can use the same layer
- **Version Control**: Layer versions are managed automatically
- **CI/CD Friendly**: Package phase is fast and doesn't require AWS credentials

### Layer Structure

The layer zip file is generated in `./.serverless/prisma-layer.zip` and contains:
- `nodejs/` directory with all Prisma engines
- `nodejs/schema.prisma` (your Prisma schema)

#### File Locations
- **Layer Zip**: `./.serverless/prisma-layer.zip` (generated during package)
- **Function Packages**: `./.serverless/{function-name}.zip` (with schema only when using layers)

### Automatic Layer Management

The plugin automatically:
- Creates the layer if it doesn't exist
- Detects content changes using SHA256 hashing
- Only uploads new versions when content changes
- Updates function configurations to use the latest layer version
- Cleans up temporary files

### Troubleshooting

If you encounter issues:

1. **Check AWS permissions**: Ensure your AWS credentials have Lambda layer permissions
2. **Verify region**: Make sure the layer is created in the same region as your functions
3. **Check logs**: The plugin provides detailed logging of layer operations
4. **Manual cleanup**: If needed, you can manually delete old layer versions in the AWS console

### Migration from Non-Layer Mode

To migrate from the default mode to layer mode:

1. Add `useLayer: true` to your configuration
2. Deploy your service - the plugin will create the layer automatically
3. Subsequent deployments will use the layer

No code changes are required in your application code.

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

