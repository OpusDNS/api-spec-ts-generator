import fs from 'fs';
import path from 'path';
import { OpenAPISpec, generatePathName, buildSchemasImport } from './utils';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

interface ResponseEntry {
  pathName: string;
  method: string;
  statusCode: string;
  schemaName: string;
  isArray: boolean;
}

function collectResponses(spec: OpenAPISpec): ResponseEntry[] {
  const entries: ResponseEntry[] = [];

  for (const [pathStr, pathItem] of Object.entries(spec.paths ?? {})) {
    const pathName = generatePathName(pathStr);

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation?.responses) continue;

      for (const [statusCode, response] of Object.entries(operation.responses)) {
        if (!response.content) continue;

        for (const contentObj of Object.values(response.content)) {
          const schema = contentObj.schema;
          if (!schema) continue;

          if (schema.$ref) {
            entries.push({
              pathName,
              method: method.toUpperCase(),
              statusCode,
              schemaName: schema.$ref.replace('#/components/schemas/', ''),
              isArray: false,
            });
          } else if (schema.type === 'array' && schema.items?.$ref) {
            entries.push({
              pathName,
              method: method.toUpperCase(),
              statusCode,
              schemaName: schema.items.$ref.replace('#/components/schemas/', ''),
              isArray: true,
            });
          }
        }
      }
    }
  }

  return entries;
}

function buildContent(entries: ResponseEntry[], schemaAliasMap: Record<string, string>): string {
  const usedAliases = new Set<string>();
  const lines: string[] = [];

  // Group by pathName + method
  const grouped = new Map<string, ResponseEntry[]>();
  for (const entry of entries) {
    const key = `${entry.method}_${entry.pathName}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(entry);
  }

  for (const [key, groupEntries] of [...grouped.entries()].sort()) {
    const sortedEntries = [...groupEntries].sort((a, b) => Number(a.statusCode) - Number(b.statusCode));
    const individualTypeNames = sortedEntries.map(e => `${key}_Response_${e.statusCode}`);

    lines.push(`export type ${key}_Response = ${individualTypeNames.join(' | ')};`);
    lines.push('');

    for (const entry of sortedEntries) {
      const individualType = `${key}_Response_${entry.statusCode}`;
      const tsAlias = schemaAliasMap[entry.schemaName];

      if (tsAlias) {
        usedAliases.add(tsAlias);
        lines.push(`export type ${individualType} = ${entry.isArray ? `${tsAlias}[]` : tsAlias};`);
      } else {
        lines.push(`export type ${individualType} = unknown;`);
      }
    }

    lines.push('');
  }

  const importLine = usedAliases.size > 0
    ? buildSchemasImport([...usedAliases].sort()) + '\n\n'
    : '';

  return importLine + lines.join('\n');
}

export function generateResponses(spec: OpenAPISpec, schemaAliasMap: Record<string, string>) {
  const entries = collectResponses(spec);
  const content = buildContent(entries, schemaAliasMap);
  const outputPath = path.join(process.cwd(), 'src/helpers/responses.d.ts');
  fs.writeFileSync(outputPath, content);
  console.log(`✅ Generated response types in ${outputPath}`);
}
