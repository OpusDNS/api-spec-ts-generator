import {
  OpenAPISchema,
  OpenAPISpec,
  assertUniqueExportNames,
  buildSchemasImport,
  toLiteral,
  toUpperSnakeCase,
  writeGeneratedFile,
} from './utils';

const GENERIC_ENVELOPE_PREFIXES = ['Pagination_', 'PageResponse_', 'ContextPayload_'];

function propertyConstantSuffix(propertyName: string): string {
  return propertyName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
}

function buildContent(spec: OpenAPISpec, schemaAliasMap: Record<string, string>): string {
  const schemas = spec.components?.schemas ?? {};
  const body: string[] = [];
  const importedTypes: string[] = [];
  const exportNames: string[] = [];

  const typesWithProperties = Object.entries(schemas)
    .filter(([schemaName, schema]) => {
      const typeName = schemaAliasMap[schemaName];
      return (
        typeName !== undefined &&
        schema.properties !== undefined &&
        Object.keys(schema.properties).length > 0 &&
        !GENERIC_ENVELOPE_PREFIXES.some(prefix => typeName.startsWith(prefix))
      );
    })
    .map(([schemaName, schema]) => ({
      typeName: schemaAliasMap[schemaName],
      properties: schema.properties as Record<string, OpenAPISchema>,
    }));

  for (const { typeName, properties } of typesWithProperties) {
    importedTypes.push(typeName);
    const typeConstName = toUpperSnakeCase(typeName);
    const keyNames: string[] = [];

    for (const propName of Object.keys(properties)) {
      const keyName = `KEY_${typeConstName}_${propertyConstantSuffix(propName)}`;
      keyNames.push(keyName);
      body.push(`export const ${keyName} = ${toLiteral(propName, "'")} satisfies keyof ${typeName};`);
    }
    exportNames.push(...keyNames, `KEYS_${typeConstName}`);

    body.push('');
    body.push(`export const KEYS_${typeConstName} = [`);
    for (const keyName of keyNames) {
      body.push(`  ${keyName},`);
    }
    body.push(`] as const satisfies (keyof ${typeName})[];`);
    body.push('');
  }

  assertUniqueExportNames('keys.ts', exportNames);

  const importLine = importedTypes.length > 0
    ? buildSchemasImport(importedTypes) + '\n\n'
    : '';

  return importLine + body.join('\n');
}

export function generateKeys(spec: OpenAPISpec, schemaAliasMap: Record<string, string>) {
  const content = buildContent(spec, schemaAliasMap);
  const outputPath = writeGeneratedFile('src/helpers/keys.ts', content);
  console.log(`✅ Generated key constants in ${outputPath}`);
}
