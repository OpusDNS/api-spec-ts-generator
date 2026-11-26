import {
  OpenAPISpec,
  assertUniqueExportNames,
  buildSchemasImport,
  toEnumKey,
  toLiteral,
  toSafeObjectKey,
  toUpperSnakeCase,
  writeGeneratedFile,
} from './utils';

interface EnumInfo {
  schemaName: string;
  constName: string;
  tsTypeName: string;
  values: (string | number)[];
  memberNames: string[] | undefined;
}

function memberNames(schemaName: string, values: (string | number)[], varnames: string[] | undefined): string[] | undefined {
  if (varnames) {
    if (varnames.length !== values.length) {
      throw new Error(`Cannot generate constants: '${schemaName}' has ${values.length} enum values but ${varnames.length} x-enum-varnames.`);
    }
    return varnames.map(toEnumKey);
  }
  if (values.every(value => typeof value === 'string')) {
    return values.map(value => toEnumKey(String(value)));
  }
  return undefined;
}

function collectEnums(spec: OpenAPISpec, schemaAliasMap: Record<string, string>): EnumInfo[] {
  const enums: EnumInfo[] = [];

  for (const [schemaName, schema] of Object.entries(spec.components?.schemas ?? {})) {
    if (!schema.enum || !Array.isArray(schema.enum)) continue;

    enums.push({
      schemaName,
      constName: toUpperSnakeCase(schemaName),
      tsTypeName: schemaAliasMap[schemaName] ?? schemaName,
      values: schema.enum,
      memberNames: memberNames(schemaName, schema.enum, schema['x-enum-varnames']),
    });
  }

  return enums;
}

function buildContent(enums: EnumInfo[]): string {
  const lines: string[] = [];
  if (enums.length > 0) {
    lines.push(buildSchemasImport(enums.map(enumInfo => enumInfo.tsTypeName)));
    lines.push('');
  }

  for (const enumInfo of enums) {
    if (enumInfo.memberNames) {
      lines.push(`export const ${enumInfo.constName} = {`);
      enumInfo.values.forEach((value, index) => {
        lines.push(`  ${toSafeObjectKey(enumInfo.memberNames![index])}: ${toLiteral(value, '"')},`);
      });
      lines.push(`} as const satisfies Record<string, ${enumInfo.tsTypeName}>;`);
      lines.push('');
    }

    lines.push(`export const ${enumInfo.constName}_VALUES = [`);
    for (const value of enumInfo.values) {
      lines.push(`  ${toLiteral(value, "'")},`);
    }
    lines.push(`] as const satisfies ReadonlyArray<${enumInfo.tsTypeName}>;`);
    lines.push('');
  }

  return lines.join('\n');
}

export function generateConstants(spec: OpenAPISpec, schemaAliasMap: Record<string, string>) {
  const enums = collectEnums(spec, schemaAliasMap);
  assertUniqueExportNames('constants.ts', enums.flatMap(enumInfo => [
    ...(enumInfo.memberNames ? [enumInfo.constName] : []),
    `${enumInfo.constName}_VALUES`,
  ]));
  console.log(`Found ${enums.length} enum constants`);

  const content = buildContent(enums);
  const outputPath = writeGeneratedFile('src/helpers/constants.ts', content);
  console.log(`✅ Generated constants in ${outputPath}`);
}
