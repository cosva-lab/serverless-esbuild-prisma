# Prisma Layer Usage

This plugin now supports using AWS Lambda Layers for Prisma engines, which can significantly reduce deployment package sizes and improve deployment speed.

## Configuration

Add the following configuration to your `serverless.yml`:

```yaml
custom:
  prisma:
    useLayer: true  # Enable layer usage
    layerName: "my-service-dev-prisma-layer"  # Optional: custom layer name (includes stage)
    layerDescription: "Prisma engines for my service"  # Optional: custom description
```

## How it works

When `useLayer: true` is set:

### During `serverless package`:
1. **Schema Only**: Only the Prisma schema is included in function packages (not engines)
2. **Layer Zip Generation**: Creates the layer zip file with Prisma engines
3. **No AWS Calls**: No network operations are performed during packaging

### During `serverless deploy`:
1. **Layer Zip Generation**: Creates the layer zip file with Prisma engines
2. **Layer Upload**: Uses the generated layer zip to create/update the Lambda layer
3. **Change Detection**: It calculates a hash of the layer content to detect changes
4. **Smart Updates**: Only uploads a new layer version when content has actually changed
5. **Function Updates**: Automatically updates all functions to use the layer

## Workflow

### Package Phase (`serverless package`)
- ✅ Only includes Prisma schema in function packages
- ✅ Generates layer zip file with Prisma engines
- ✅ No AWS API calls
- ✅ Fast and offline operation
- ✅ Perfect for CI/CD pipelines

### Deploy Phase (`serverless deploy`)
- ✅ Generates layer zip file with Prisma engines
- ✅ Creates/updates Lambda layer using the generated zip
- ✅ Detects changes and only uploads when needed
- ✅ Updates function configurations to use layer
- ✅ Handles AWS operations
- ✅ Works independently (no need to run package first)

## Benefits

- **Smaller Packages**: Function packages are much smaller without Prisma engines
- **Faster Deployments**: Engines are cached in the layer, reducing upload time
- **Shared Resources**: Multiple functions can use the same layer
- **Version Control**: Layer versions are managed automatically
- **CI/CD Friendly**: Package phase is fast and doesn't require AWS credentials

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `useLayer` | boolean | `false` | Enable/disable layer usage |
| `layerName` | string | `{service}-{stage}-prisma-layer` | Custom layer name (includes stage) |
| `layerDescription` | string | `Prisma engines layer for serverless functions` | Layer description |
| `debug` | boolean | `false` | Enable debug logging for troubleshooting |

## Example serverless.yml

```yaml
service: my-api

provider:
  name: aws
  runtime: nodejs20.x
  region: us-east-1
  stage: dev  # This will be included in layer name

custom:
  prisma:
    useLayer: true
    layerName: "my-api-dev-prisma-layer"  # Optional: custom name
    layerDescription: "Prisma engines for my API"
    debug: true  # Optional: enable debug logging

functions:
  hello:
    handler: src/handler.hello
    # Layer will be automatically added to this function

plugins:
  - @cosva-lab/serverless-esbuild-prisma
```

## Layer Structure

The layer zip file is generated in `./.serverless/prisma-layer.zip` and contains:
- `nodejs/` directory with all Prisma engines
- `nodejs/schema.prisma` (your Prisma schema)

### File Locations
- **Layer Zip**: `./.serverless/prisma-layer.zip` (generated during package)
- **Function Packages**: `./.serverless/{function-name}.zip` (with schema only when using layers)

## Automatic Layer Management

The plugin automatically:
- Creates the layer if it doesn't exist
- Detects content changes using SHA256 hashing
- Only uploads new versions when content changes
- Updates function configurations to use the latest layer version
- Cleans up temporary files

## Troubleshooting

If you encounter issues:

1. **Check AWS permissions**: Ensure your AWS credentials have Lambda layer permissions
2. **Verify region**: Make sure the layer is created in the same region as your functions
3. **Check logs**: The plugin provides detailed logging of layer operations
4. **Manual cleanup**: If needed, you can manually delete old layer versions in the AWS console

## Migration from Non-Layer Mode

To migrate from the default mode to layer mode:

1. Add `useLayer: true` to your configuration
2. Deploy your service - the plugin will create the layer automatically
3. Subsequent deployments will use the layer

No code changes are required in your application code.
