import { generateConstants } from './generate-constants';
import { generateIndex } from './generate-index';
import { generateResponses } from './generate-responses';
import { generateRequests } from './generate-requests';
import { generateSchemas } from './generate-schemas';
import { generateSchemasArrays } from './generate-schemas-arrays';
import { generateKeys } from './generate-keys';
import { PathOrFileDescriptor } from 'fs';

export async function generateAllHelpers(schemaPath: PathOrFileDescriptor) {
  generateSchemas(schemaPath);
  generateSchemasArrays(schemaPath);
  generateKeys(schemaPath);
  generateResponses(schemaPath);
  generateRequests(schemaPath);
  generateConstants(schemaPath);
  generateIndex();
}
