import {
  HTTP_METHODS,
  HttpMethodName,
  OpenAPISpec,
  buildSchemasImport,
  generatePathName,
  operationTypePath,
  pickContentType,
  schemaRefName,
  writeGeneratedFile,
} from './utils';

interface ResponseEntry {
  pathString: string;
  pathName: string;
  method: HttpMethodName;
  statusCode: string;
  contentType: string;
  schemaName: string | undefined;
  isArray: boolean;
}

function collectResponses(spec: OpenAPISpec): ResponseEntry[] {
  const entries: ResponseEntry[] = [];

  for (const [pathString, pathItem] of Object.entries(spec.paths ?? {})) {
    const pathName = generatePathName(pathString);

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation?.responses) continue;

      for (const [statusCode, response] of Object.entries(operation.responses)) {
        const contentType = pickContentType(response.content);
        const schema = contentType ? response.content?.[contentType]?.schema : undefined;
        if (!contentType || !schema) continue;

        const itemSchemaName = schema.type === 'array' ? schemaRefName(schema.items) : undefined;
        entries.push({
          pathString,
          pathName,
          method,
          statusCode,
          contentType,
          schemaName: schemaRefName(schema) ?? itemSchemaName,
          isArray: itemSchemaName !== undefined,
        });
      }
    }
  }

  return entries;
}

function statusCodeIndex(statusCode: string): string {
  return /^\d+$/.test(statusCode) ? statusCode : `'${statusCode}'`;
}

function responseType(entry: ResponseEntry, schemaAliasMap: Record<string, string>): string {
  const alias = entry.schemaName ? schemaAliasMap[entry.schemaName] : undefined;
  if (alias) {
    return entry.isArray ? `${alias}[]` : alias;
  }
  return `${operationTypePath(entry.pathString, entry.method)}['responses'][${statusCodeIndex(entry.statusCode)}]['content']['${entry.contentType}']`;
}

function buildContent(entries: ResponseEntry[], schemaAliasMap: Record<string, string>): string {
  const usedAliases = new Set<string>();
  const lines: string[] = [];

  const grouped = new Map<string, ResponseEntry[]>();
  for (const entry of entries) {
    const key = `${entry.method.toUpperCase()}_${entry.pathName}`;
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }

  for (const [key, groupEntries] of [...grouped.entries()].sort()) {
    const sortedEntries = [...groupEntries].sort((a, b) => a.statusCode.localeCompare(b.statusCode));
    const individualTypeNames = sortedEntries.map(entry => `${key}_Response_${entry.statusCode}`);

    lines.push(`export type ${key}_Response = ${individualTypeNames.join(' | ')};`);
    lines.push('');

    for (const entry of sortedEntries) {
      const alias = entry.schemaName ? schemaAliasMap[entry.schemaName] : undefined;
      if (alias) {
        usedAliases.add(alias);
      }
      lines.push(`export type ${key}_Response_${entry.statusCode} = ${responseType(entry, schemaAliasMap)};`);
    }

    lines.push('');
  }

  const schemaImport = usedAliases.size > 0
    ? buildSchemasImport([...usedAliases].sort()) + '\n'
    : '';

  return `import type { paths } from '../schema';\n${schemaImport}\n` + lines.join('\n');
}

export function generateResponses(spec: OpenAPISpec, schemaAliasMap: Record<string, string>) {
  const entries = collectResponses(spec);
  const content = buildContent(entries, schemaAliasMap);
  const outputPath = writeGeneratedFile('src/helpers/responses.d.ts', content);
  console.log(`✅ Generated response types in ${outputPath}`);
}
