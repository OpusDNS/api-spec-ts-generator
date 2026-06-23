import fs, { PathOrFileDescriptor } from 'fs';
import yaml from 'js-yaml';
import { OpenAPISpec } from './utils';
import { generateConstants } from './generate-constants';
import { generateResponses } from './generate-responses';
import { generateRequests } from './generate-requests';
import { generateSchemas } from './generate-schemas';
import { generateKeys } from './generate-keys';
import { generateEndpoints } from './generate-endpoints';
import { generatePermissions } from './generate-permissions';

export function generateAllHelpers(schemaPath: PathOrFileDescriptor) {
  const spec = yaml.load(fs.readFileSync(schemaPath, 'utf-8')) as OpenAPISpec;
  const schemaAliasMap = generateSchemas(spec);
  generateKeys(spec, schemaAliasMap);
  generateResponses(spec, schemaAliasMap);
  generateRequests(spec, schemaAliasMap);
  generateConstants(spec, schemaAliasMap);
  const endpointNameMap = generateEndpoints(spec);
  generatePermissions(spec, schemaAliasMap, endpointNameMap);
}
