# OpenAPI generator of TypeScript Types, Constants and other Helpers

This repository contains the scripts used to generate TypeScript types, constants and other helpers based on an [OpenAPI specification](https://swagger.io/specification/).

It's what powers our [api-spec](https://github.com/OpusDNS/api-spec) repository at [OpusDNS](https://opusdns.com/)!

## Installation

```bash
npm install @opusdns/api-spec-ts-generator
```

## Usage

```
import { generateAllHelpers, generateSchema } from '@opusdns/api-spec-ts-generator';

const schemaPath = new URL("openapi.yaml", import.meta.url);

const openApiSchema = await generateSchema(schemaPath);

generateAllHelpers(schemaPath); // helpers are generated to `/src/helpers`
```

### Links

- [OpusDNS](https://www.opusdns.com/)
- [OpusDNS Developer docs](https://developers.opusdns.com/)
