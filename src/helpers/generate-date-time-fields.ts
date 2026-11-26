import { OpenAPISchema, OpenAPISpec, walkSchemas, writeGeneratedFile } from './utils';

function hasDateTimeFormat(schema: OpenAPISchema | undefined): boolean {
  if (!schema) {
    return false;
  }
  if (schema.format === 'date-time') {
    return true;
  }
  return [...(schema.anyOf ?? []), ...(schema.oneOf ?? []), ...(schema.allOf ?? [])].some(hasDateTimeFormat);
}

function collectDateTimeFieldNames(spec: OpenAPISpec): string[] {
  const names = new Set<string>();

  walkSchemas(spec, node => {
    for (const [propertyName, propertySchema] of Object.entries(node.properties ?? {})) {
      if (hasDateTimeFormat(propertySchema)) {
        names.add(propertyName);
      }
    }
    const parameter = node as { name?: unknown; in?: unknown; schema?: OpenAPISchema };
    if (typeof parameter.name === 'string' && typeof parameter.in === 'string' && hasDateTimeFormat(parameter.schema)) {
      names.add(parameter.name);
    }
  });

  return [...names].sort();
}

export function generateDateTimeFields(spec: OpenAPISpec) {
  const names = collectDateTimeFieldNames(spec);
  const lines = [
    'export const DATE_TIME_FIELD_NAMES: ReadonlySet<string> = new Set([',
    ...names.map(name => `  '${name}',`),
    ']);',
    '',
  ];

  const outputPath = writeGeneratedFile('src/helpers/date-time-fields.ts', lines.join('\n'));
  console.log(`✅ Generated ${names.length} date-time field names in ${outputPath}`);
}
