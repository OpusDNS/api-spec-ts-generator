import fs from 'fs';
import path from 'path';
import { OpenAPISpec, OpenAPISchema, toUpperSnakeCase, buildSchemasImport } from './utils';

function buildContent(spec: OpenAPISpec, schemaAliasMap: Record<string, string>): string {
  const schemas = spec.components?.schemas ?? {};
  const body: string[] = [];
  const importedTypes: string[] = [];

  const typesWithProperties = Object.entries(schemas)
    .filter(([schemaName, schema]) => {
      const typeName = schemaAliasMap[schemaName];
      return (
        typeName !== undefined &&
        schema.properties !== undefined &&
        Object.keys(schema.properties).length > 0 &&
        !typeName.startsWith('Pagination_')
      );
    })
    .map(([schemaName, schema]) => ({
      typeName: schemaAliasMap[schemaName],
      properties: schema.properties as Record<string, OpenAPISchema>,
    }));

  for (const { typeName, properties } of typesWithProperties) {
    importedTypes.push(typeName);
    const typeConstName = toUpperSnakeCase(typeName);

    for (const propName of Object.keys(properties)) {
      body.push(`export const KEY_${typeConstName}_${propName.toUpperCase()} = '${propName}' satisfies keyof ${typeName};`);
    }

    body.push('');
    body.push(`export const KEYS_${typeConstName} = [`);
    for (const propName of Object.keys(properties)) {
      body.push(`  KEY_${typeConstName}_${propName.toUpperCase()},`);
    }
    body.push(`] as const satisfies (keyof ${typeName})[];`);
    body.push('');
  }

  const importLine = importedTypes.length > 0
    ? buildSchemasImport(importedTypes) + '\n\n'
    : '';

  return importLine + body.join('\n');
}

export function generateKeys(spec: OpenAPISpec, schemaAliasMap: Record<string, string>) {
  const content = buildContent(spec, schemaAliasMap);
  const outputPath = path.join(process.cwd(), 'src/helpers/keys.ts');
  fs.writeFileSync(outputPath, content);
  console.log(`✅ Generated key constants in ${outputPath}`);
}
