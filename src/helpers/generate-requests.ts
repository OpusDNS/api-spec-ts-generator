import {
  HTTP_METHODS,
  HttpMethodName,
  OpenAPISpec,
  buildSchemasImport,
  generatePathName,
  operationTypePath,
  pickContentType,
  resolveParameters,
  schemaRefName,
  writeGeneratedFile,
} from './utils';

interface RequestBody {
  schemaName?: string;
  isArray: boolean;
  contentType: string;
}

interface RequestData {
  pathString: string;
  pathName: string;
  method: HttpMethodName;
  hasQueryParams: boolean;
  hasPathParams: boolean;
  body: RequestBody | undefined;
}

function collectRequests(spec: OpenAPISpec): RequestData[] {
  const requests: RequestData[] = [];

  for (const [pathString, pathItem] of Object.entries(spec.paths ?? {})) {
    const pathName = generatePathName(pathString);

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const parameters = resolveParameters(spec, pathItem, operation);
      const contentType = pickContentType(operation.requestBody?.content);
      const bodySchema = contentType ? operation.requestBody?.content?.[contentType]?.schema : undefined;
      const itemSchemaName = bodySchema?.type === 'array' ? schemaRefName(bodySchema.items) : undefined;

      requests.push({
        pathString,
        pathName,
        method,
        hasQueryParams: parameters.some(parameter => parameter.in === 'query'),
        hasPathParams: parameters.some(parameter => parameter.in === 'path'),
        body: contentType
          ? { schemaName: schemaRefName(bodySchema) ?? itemSchemaName, isArray: itemSchemaName !== undefined, contentType }
          : undefined,
      });
    }
  }

  return requests;
}

function bodyType(request: RequestData, body: RequestBody, schemaAliasMap: Record<string, string>): string {
  const alias = body.schemaName ? schemaAliasMap[body.schemaName] : undefined;
  if (alias) {
    return body.isArray ? `${alias}[]` : alias;
  }
  return `NonNullable<${operationTypePath(request.pathString, request.method)}['requestBody']>['content']['${body.contentType}']`;
}

function buildContent(requests: RequestData[], schemaAliasMap: Record<string, string>): string {
  const usedAliases = new Set<string>();
  const lines: string[] = [];

  const sorted = [...requests].sort((a, b) =>
    a.pathName.localeCompare(b.pathName) || a.method.localeCompare(b.method)
  );

  for (const request of sorted) {
    const typeBase = `${request.method.toUpperCase()}_${request.pathName}_Request`;
    const hasParams = request.hasQueryParams || request.hasPathParams;

    const fields: string[] = [];
    if (hasParams) {
      fields.push(`  parameters: ${operationTypePath(request.pathString, request.method)}['parameters'];`);
    }
    if (request.body) {
      const alias = request.body.schemaName ? schemaAliasMap[request.body.schemaName] : undefined;
      if (alias) {
        usedAliases.add(alias);
      }
      fields.push(`  requestBody: ${bodyType(request, request.body, schemaAliasMap)};`);
    }

    lines.push(`export type ${typeBase} = {`);
    lines.push(...fields);
    lines.push(`};`);

    if (request.hasQueryParams) {
      lines.push(`export type ${typeBase}_Query = NonNullable<${typeBase}['parameters']['query']>;`);
    }
    if (request.hasPathParams) {
      lines.push(`export type ${typeBase}_Path = NonNullable<${typeBase}['parameters']['path']>;`);
    }
    if (request.body) {
      lines.push(`export type ${typeBase}_Body = ${typeBase}['requestBody'];`);
    }

    lines.push('');
  }

  const schemaImport = usedAliases.size > 0
    ? buildSchemasImport([...usedAliases].sort()) + '\n'
    : '';

  return `import type { paths } from '../schema';\n${schemaImport}\n` + lines.join('\n');
}

export function generateRequests(spec: OpenAPISpec, schemaAliasMap: Record<string, string>) {
  const requests = collectRequests(spec);
  const content = buildContent(requests, schemaAliasMap);
  const outputPath = writeGeneratedFile('src/helpers/requests.d.ts', content);
  console.log(`✅ Generated request types in ${outputPath}`);
}
