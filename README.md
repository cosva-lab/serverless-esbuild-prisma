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
  esbuild:
    outputDir: ./path/to/output/dir # Optional: Specify the output directory for esbuild
```

#### Layer Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `useLayer` | boolean | `false` | Enable/disable layer usage |
| `layerName` | string | `{service}-{stage}-prisma-layer` | Custom layer name (includes stage) |
| `layerDescription` | string | `Prisma engines layer for serverless functions` | Layer description |

For detailed layer usage information, see [LAYER_USAGE.md](./LAYER_USAGE.md).

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

