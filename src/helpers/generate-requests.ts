import fs from 'fs';
import path from 'path';
import { OpenAPISpec, generatePathName } from './utils';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

interface RequestData {
  pathName: string;
  method: string;
  operationId: string | undefined;
  hasQueryParams: boolean;
  hasPathParams: boolean;
  bodySchemaName: string | undefined;
  bodyIsArray: boolean;
}

function collectRequests(spec: OpenAPISpec): RequestData[] {
  const requests: RequestData[] = [];

  for (const [pathStr, pathItem] of Object.entries(spec.paths ?? {})) {
    const pathName = generatePathName(pathStr);

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const hasQueryParams = operation.parameters?.some(p => p.in === 'query') ?? false;
      const hasPathParams = operation.parameters?.some(p => p.in === 'path') ?? false;

      const bodySchema = operation.requestBody?.content?.['application/json']?.schema;
      let bodySchemaName: string | undefined;
      let bodyIsArray = false;

      if (bodySchema?.$ref) {
        bodySchemaName = bodySchema.$ref.replace('#/components/schemas/', '');
      } else if (bodySchema?.type === 'array' && bodySchema.items?.$ref) {
        bodySchemaName = bodySchema.items.$ref.replace('#/components/schemas/', '');
        bodyIsArray = true;
      }

      requests.push({
        pathName,
        method: method.toUpperCase(),
        operationId: operation.operationId,
        hasQueryParams,
        hasPathParams,
        bodySchemaName,
        bodyIsArray,
      });
    }
  }

  return requests;
}

function buildContent(requests: RequestData[], schemaAliasMap: Record<string, string>): string {
  const usedAliases = new Set<string>();
  const lines: string[] = [];

  const sorted = [...requests].sort((a, b) =>
    a.pathName.localeCompare(b.pathName) || a.method.localeCompare(b.method)
  );

  for (const req of sorted) {
    const typeBase = `${req.method}_${req.pathName}_Request`;
    const hasParams = req.hasQueryParams || req.hasPathParams;

    const bodyTypeName = req.bodySchemaName
      ? (schemaAliasMap[req.bodySchemaName] ?? req.bodySchemaName)
      : undefined;

    if (bodyTypeName) {
      usedAliases.add(bodyTypeName);
    }

    const fields: string[] = [];
    if (hasParams && req.operationId) {
      fields.push(`  parameters: operations['${req.operationId}']['parameters'];`);
    }
    if (bodyTypeName) {
      const bodyType = req.bodyIsArray ? `${bodyTypeName}[]` : bodyTypeName;
      fields.push(`  requestBody: ${bodyType};`);
    }

    lines.push(`export type ${typeBase} = {`);
    lines.push(...fields);
    lines.push(`};`);

    if (hasParams && req.operationId) {
      if (req.hasQueryParams) {
        lines.push(`export type ${typeBase}_Query = ${typeBase}['parameters']['query'];`);
      }
      if (req.hasPathParams) {
        lines.push(`export type ${typeBase}_Path = ${typeBase}['parameters']['path'];`);
      }
    }
    if (bodyTypeName) {
      lines.push(`export type ${typeBase}_Body = ${typeBase}['requestBody'];`);
    }

    lines.push('');
  }

  const schemaImport = usedAliases.size > 0
    ? `import type { ${[...usedAliases].sort().join(', ')} } from './schemas';\n`
    : '';

  return `import type { operations } from '../schema';\n${schemaImport}\n` + lines.join('\n');
}

export function generateRequests(spec: OpenAPISpec, schemaAliasMap: Record<string, string>) {
  const requests = collectRequests(spec);
  const content = buildContent(requests, schemaAliasMap);
  const outputPath = path.join(process.cwd(), 'src/helpers/requests.d.ts');
  fs.writeFileSync(outputPath, content);
  console.log(`✅ Generated request types in ${outputPath}`);
}
