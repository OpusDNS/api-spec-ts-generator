import {
  HTTP_METHODS,
  OpenAPISchema,
  OpenAPISpec,
  assertUniqueExportNames,
  buildSchemasImport,
  nonNullMembers,
  resolveParameters,
  toSafeObjectKey,
  toUpperSnakeCase,
  writeGeneratedFile,
} from './utils';

const NUMERIC_CONSTRAINT_KEYS = [
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minItems',
  'maxItems',
] as const;

const FORMATS_WITHOUT_LITERAL_DEFAULTS = new Set(['date-time', 'date', 'typeid', 'binary']);

const unsupportedPatterns: string[] = [];

function candidateSchemas(schema: OpenAPISchema): OpenAPISchema[] {
  const members = nonNullMembers(schema);
  return members.length === 1 ? [schema, members[0]] : [schema];
}

function patternLiteral(pattern: string, location: string): string | undefined {
  for (const flags of ['u', '']) {
    try {
      return new RegExp(pattern, flags).toString();
    } catch {
      continue;
    }
  }
  unsupportedPatterns.push(`${location}: ${pattern}`);
  return undefined;
}

function constraintEntries(schema: OpenAPISchema, location: string): string[] {
  const entries: string[] = [];
  const candidates = candidateSchemas(schema);

  for (const key of NUMERIC_CONSTRAINT_KEYS) {
    const value = candidates.map(candidate => candidate[key]).find(candidateValue => typeof candidateValue === 'number');
    if (value !== undefined) {
      entries.push(`${key}: ${value}`);
    }
  }

  const isTypeId = candidates.some(candidate => candidate['x-typeid-prefix'] !== undefined);
  const pattern = candidates.map(candidate => candidate.pattern).find(candidatePattern => candidatePattern !== undefined);
  if (pattern !== undefined && !isTypeId) {
    const literal = patternLiteral(pattern, location);
    if (literal) {
      entries.push(`pattern: ${literal}`);
    }
  }

  return entries;
}

function literalDefault(schema: OpenAPISchema): string | undefined {
  if (schema.default === undefined || schema.default === null) {
    return undefined;
  }
  if (candidateSchemas(schema).some(candidate => candidate.format && FORMATS_WITHOUT_LITERAL_DEFAULTS.has(candidate.format))) {
    return undefined;
  }
  return JSON.stringify(schema.default);
}

function buildSchemaBlocks(spec: OpenAPISpec, schemaAliasMap: Record<string, string>) {
  const lines: string[] = [];
  const exportNames: string[] = [];
  const importedTypes = new Set<string>();

  for (const schemaName of Object.keys(spec.components?.schemas ?? {}).sort()) {
    const schema = spec.components?.schemas?.[schemaName];
    const typeName = schemaAliasMap[schemaName];
    if (!schema?.properties || !typeName) {
      continue;
    }

    const constraintLines: string[] = [];
    const defaultLines: string[] = [];
    for (const [propertyName, propertySchema] of Object.entries(schema.properties)) {
      const key = toSafeObjectKey(propertyName);
      const entries = constraintEntries(propertySchema, `${schemaName}.${propertyName}`);
      if (entries.length > 0) {
        constraintLines.push(`  ${key}: { ${entries.join(', ')} },`);
      }
      const defaultValue = literalDefault(propertySchema);
      if (defaultValue !== undefined) {
        defaultLines.push(`  ${key}: ${defaultValue},`);
      }
    }

    const constPrefix = toUpperSnakeCase(typeName);
    if (constraintLines.length > 0) {
      importedTypes.add(typeName);
      exportNames.push(`${constPrefix}_CONSTRAINTS`);
      lines.push(`export const ${constPrefix}_CONSTRAINTS = {`, ...constraintLines);
      lines.push(`} as const satisfies { readonly [K in keyof ${typeName}]?: FieldConstraints };`, '');
    }
    if (defaultLines.length > 0) {
      importedTypes.add(typeName);
      exportNames.push(`${constPrefix}_DEFAULTS`);
      lines.push(`export const ${constPrefix}_DEFAULTS = {`, ...defaultLines);
      lines.push(`} satisfies Partial<${typeName}>;`, '');
    }
  }

  return { lines, exportNames, importedTypes };
}

function buildParameterBlock(spec: OpenAPISpec, endpointNameMap: Record<string, string>) {
  const lines: string[] = ['export const PARAMETER_CONSTRAINTS = {'];
  const usedEndpoints = new Set<string>();

  for (const pathString of Object.keys(spec.paths ?? {}).sort()) {
    const pathItem = spec.paths?.[pathString];
    if (!pathItem) {
      continue;
    }
    const methodLines: string[] = [];
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) {
        continue;
      }
      const parameterLines: string[] = [];
      for (const parameter of resolveParameters(spec, pathItem, operation)) {
        if (parameter.in !== 'query' || !parameter.schema) {
          continue;
        }
        const entries = constraintEntries(parameter.schema, `${method.toUpperCase()} ${pathString} ?${parameter.name}`);
        const defaultValue = literalDefault(parameter.schema);
        if (defaultValue !== undefined) {
          entries.unshift(`default: ${defaultValue}`);
        }
        if (entries.length > 0) {
          parameterLines.push(`      ${toSafeObjectKey(parameter.name)}: { ${entries.join(', ')} },`);
        }
      }
      if (parameterLines.length > 0) {
        methodLines.push(`    ${method}: {`, ...parameterLines, '    },');
      }
    }
    if (methodLines.length > 0) {
      const endpointName = endpointNameMap[pathString];
      usedEndpoints.add(endpointName);
      lines.push(`  [${endpointName}]: {`, ...methodLines, '  },');
    }
  }

  lines.push(
    '} as const satisfies {',
    '  readonly [E in Endpoint]?: { readonly [M in HttpMethod]?: Readonly<Record<string, ParameterConstraints>> };',
    '};',
    '',
  );

  return { lines, usedEndpoints };
}

export function generateConstraints(
  spec: OpenAPISpec,
  schemaAliasMap: Record<string, string>,
  endpointNameMap: Record<string, string>,
) {
  unsupportedPatterns.length = 0;
  const schemaBlocks = buildSchemaBlocks(spec, schemaAliasMap);
  const parameterBlock = buildParameterBlock(spec, endpointNameMap);
  assertUniqueExportNames('constraints.ts', schemaBlocks.exportNames);

  const header = [
    buildSchemasImport([...schemaBlocks.importedTypes].sort()),
    `import { type Endpoint, ${[...parameterBlock.usedEndpoints].sort().join(', ')} } from './endpoints';`,
    "import type { HttpMethod } from './permissions';",
    '',
    'export interface FieldConstraints {',
    ...NUMERIC_CONSTRAINT_KEYS.map(key => `  readonly ${key}?: number;`),
    '  readonly pattern?: RegExp;',
    '}',
    '',
    'export interface ParameterConstraints extends FieldConstraints {',
    '  readonly default?: unknown;',
    '}',
    '',
  ];

  const content = [...header, ...parameterBlock.lines, ...schemaBlocks.lines].join('\n');
  const outputPath = writeGeneratedFile('src/helpers/constraints.ts', content);
  for (const unsupported of unsupportedPatterns) {
    console.warn(`⚠️  Skipped a pattern that is not a valid JavaScript regular expression: ${unsupported}`);
  }
  console.log(`✅ Generated ${schemaBlocks.exportNames.length} constraint/default maps in ${outputPath}`);
}
