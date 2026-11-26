import { writeGeneratedFile } from './utils';

const VALUE_MODULES = ['constants', 'constraints', 'date-time-fields', 'endpoints', 'keys', 'permissions', 'typeids'];
const TYPE_MODULES = ['requests.d', 'responses.d', 'schemas.d'];

export function generateIndex() {
  const lines = [
    ...VALUE_MODULES.map(moduleName => `export * from './${moduleName}';`),
    ...TYPE_MODULES.map(moduleName => `export type * from './${moduleName}';`),
    '',
  ];
  const outputPath = writeGeneratedFile('src/helpers/index.ts', lines.join('\n'));
  console.log(`✅ Generated helpers barrel in ${outputPath}`);
}
