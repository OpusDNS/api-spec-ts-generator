# OpenAPI generator of TypeScript Types, Constants and other Helpers

This repository contains the scripts used to generate TypeScript types, constants and other helpers based on an [OpenAPI specification](https://swagger.io/specification/).

It's what powers our [api-spec](https://github.com/OpusDNS/api-spec) repository at [OpusDNS](https://opusdns.com/)!

## Installation

```bash
npm install @opusdns/api-spec-ts-generator
```

## Usage

```js
import { generateAllHelpers, generateSchema } from '@opusdns/api-spec-ts-generator';

const schemaPath = new URL("openapi.yaml", import.meta.url);

const openApiSchema = await generateSchema(schemaPath);

generateAllHelpers(schemaPath); // helpers are generated to `/src/helpers`
```

### Generated helpers

| File | Exports |
|---|---|
| `schemas.d.ts` | A type alias per component schema |
| `requests.d.ts` / `responses.d.ts` | `METHOD_Path_Request` (`_Query`, `_Path`, `_Body`) and `METHOD_Path_Response` (`_STATUS`) types |
| `constants.ts` | `X_VALUES` per enum, plus an `X` map for string enums and enums with `x-enum-varnames` |
| `keys.ts` | `KEY_TYPE_PROP` property-name constants and `KEYS_TYPE` lists |
| `endpoints.ts` | `*_ENDPOINT` path constants, `ENDPOINT_VALUES`, `Endpoint`, `isEndpoint()` |
| `permissions.ts` | `PUBLIC_PERMISSION`, `REQUIRED_PERMISSIONS`, `getRequiredPermissions()` |
| `constraints.ts` | `<TYPE>_CONSTRAINTS`, `<TYPE>_DEFAULTS`, `PARAMETER_CONSTRAINTS` |
| `date-time-fields.ts` | `DATE_TIME_FIELD_NAMES` (fields to revive into `Date`) |
| `typeids.ts` | `TYPEID_PREFIX`, `TYPEID_PREFIX_VALUES`, `TypeIdPrefix`, `TYPEID_PATTERN` |
| `index.ts` | Barrel re-exporting all of the above |

### Links

- [OpusDNS](https://www.opusdns.com/)
- [OpusDNS Developer docs](https://developers.opusdns.com/)
