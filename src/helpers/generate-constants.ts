import fs from 'fs';
import path from 'path';
import { OpenAPISpec, toUpperSnakeCase, toEnumKey, buildSchemasImport } from './utils';

interface EnumInfo {
  constName: string;
  tsTypeName: string;
  values: (string | number)[];
  type: 'string' | 'integer';
}

function generateSafeKey(key: string): string {
  return /^\d/.test(key) ? `"${key}"` : key;
}

function collectEnums(spec: OpenAPISpec, schemaAliasMap: Record<string, string>): EnumInfo[] {
  const enums: EnumInfo[] = [];

  for (const [schemaName, schema] of Object.entries(spec.components?.schemas ?? {})) {
    if (!schema.enum || !Array.isArray(schema.enum)) continue;

    const tsTypeName = schemaAliasMap[schemaName] ?? schemaName;
    enums.push({
      constName: toUpperSnakeCase(schemaName),
      tsTypeName,
      values: schema.enum,
      type: (schema.type === 'integer' ? 'integer' : 'string') as 'string' | 'integer',
    });
  }

  return enums;
}

function buildContent(enums: EnumInfo[]): string {
  const importedTypes = enums.map(e => e.tsTypeName);
  const lines: string[] = [];
  if (importedTypes.length > 0) {
    lines.push(buildSchemasImport(importedTypes));
    lines.push('');
  }

  for (const enumInfo of enums) {
    if (enumInfo.type === 'integer') {
      lines.push(`export const ${enumInfo.constName} = [`);
      for (const value of enumInfo.values) {
        lines.push(`  ${value},`);
      }
      lines.push(`] as const satisfies ReadonlyArray<${enumInfo.tsTypeName}>;`);
      lines.push('');
    } else {
      lines.push(`export const ${enumInfo.constName} = {`);
      for (const value of enumInfo.values) {
        const key = generateSafeKey(toEnumKey(String(value)));
        lines.push(`  ${key}: "${value}",`);
      }
      lines.push(`} as const satisfies Record<string, ${enumInfo.tsTypeName}>;`);
      lines.push('');

      lines.push(`export const ${enumInfo.constName}_VALUES = [`);
      for (const value of enumInfo.values) {
        lines.push(`  '${value}',`);
      }
      lines.push(`] as const satisfies ReadonlyArray<${enumInfo.tsTypeName}>;`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function generateConstants(spec: OpenAPISpec, schemaAliasMap: Record<string, string>) {
  const enums = collectEnums(spec, schemaAliasMap);
  console.log(`Found ${enums.length} enum constants`);

  const content = buildContent(enums);
  const outputPath = path.resolve('src/helpers/constants.ts');
  fs.writeFileSync(outputPath, content);
  console.log(`✅ Generated constants in ${outputPath}`);
}
