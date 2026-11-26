import fs from 'fs';
import path from 'path';

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
export type HttpMethodName = (typeof HTTP_METHODS)[number];

export interface OpenAPISchema {
  title?: string;
  description?: string;
  type?: string;
  properties?: Record<string, OpenAPISchema>;
  required?: string[];
  enum?: (string | number)[];
  items?: OpenAPISchema;
  $ref?: string;
  nullable?: boolean;
  format?: string;
  anyOf?: OpenAPISchema[];
  oneOf?: OpenAPISchema[];
  allOf?: OpenAPISchema[];
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minItems?: number;
  maxItems?: number;
  'x-typeid-prefix'?: string;
  'x-enum-descriptions'?: string[];
  'x-enum-varnames'?: string[];
}

export interface OpenAPIParameter {
  $ref?: string;
  name: string;
  in: string;
  required?: boolean;
  schema?: OpenAPISchema;
}

export interface OpenAPIMediaType {
  schema?: OpenAPISchema;
}

export interface OpenAPIOperation {
  operationId?: string;
  parameters?: OpenAPIParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, OpenAPIMediaType>;
  };
  responses?: Record<string, {
    content?: Record<string, OpenAPIMediaType>;
  }>;
  'x-required-permissions'?: string[];
}

export type OpenAPIPathItem = Partial<Record<HttpMethodName, OpenAPIOperation>> & {
  parameters?: OpenAPIParameter[];
};

export interface OpenAPISpec {
  components?: {
    schemas?: Record<string, OpenAPISchema>;
    parameters?: Record<string, OpenAPIParameter>;
  };
  paths?: Record<string, OpenAPIPathItem>;
}

const SCHEMA_REF_PREFIX = '#/components/schemas/';
const PARAMETER_REF_PREFIX = '#/components/parameters/';
const PREFERRED_CONTENT_TYPES = ['application/json', 'application/problem+json'];

export function schemaRefName(schema: OpenAPISchema | undefined): string | undefined {
  if (!schema?.$ref?.startsWith(SCHEMA_REF_PREFIX)) {
    return undefined;
  }
  return schema.$ref.slice(SCHEMA_REF_PREFIX.length);
}

export function resolveParameters(spec: OpenAPISpec, pathItem: OpenAPIPathItem, operation: OpenAPIOperation): OpenAPIParameter[] {
  const resolved = new Map<string, OpenAPIParameter>();
  for (const parameter of [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]) {
    const definition = parameter.$ref?.startsWith(PARAMETER_REF_PREFIX)
      ? spec.components?.parameters?.[parameter.$ref.slice(PARAMETER_REF_PREFIX.length)]
      : parameter;
    if (!definition) {
      throw new Error(`Cannot resolve parameter reference '${parameter.$ref}'.`);
    }
    resolved.set(`${definition.in}:${definition.name}`, definition);
  }
  return [...resolved.values()];
}

export function pickContentType(content: Record<string, OpenAPIMediaType> | undefined): string | undefined {
  const contentTypes = Object.keys(content ?? {});
  return PREFERRED_CONTENT_TYPES.find(contentType => contentTypes.includes(contentType)) ?? contentTypes[0];
}

export function nonNullMembers(schema: OpenAPISchema): OpenAPISchema[] {
  return [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].filter(member => member.type !== 'null');
}

export function operationTypePath(pathString: string, method: HttpMethodName): string {
  return `paths['${pathString}']['${method}']`;
}

function toPascalCase(segment: string): string {
  return segment.split(/[-_]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
}

export function generatePathName(pathString: string): string {
  return pathString
    .split('/')
    .filter(segment => segment.length > 0 && segment !== 'v1')
    .map(segment => {
      if (segment.startsWith('{') && segment.endsWith('}')) {
        return 'By' + toPascalCase(segment.slice(1, -1));
      }
      return toPascalCase(segment);
    })
    .join('');
}

export function toUpperSnakeCase(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/([A-Z]+)(?=[A-Z][a-z]|$)/g, '$1_')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toUpperCase()
    .replace(/__+/g, '_')
    .replace(/_+$/, '');
}

export function toEnumKey(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/([A-Z]+)(?=[A-Z][a-z]|$)/g, '$1_')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toUpperCase()
    .replace(/__+/g, '_')
    .replace(/_+$/, '');
}

export function toLiteral(value: string | number | boolean, quote: '"' | "'" = "'"): string {
  if (typeof value !== 'string') {
    return String(value);
  }
  return /["'\\\n]/.test(value) ? JSON.stringify(value) : `${quote}${value}${quote}`;
}

export function toSafeObjectKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

const TYPE_NAME_OVERRIDES: Array<{ matches: (schemaName: string) => boolean; typeName: string }> = [
  {
    matches: schemaName => schemaName.includes('availability__datasource') && schemaName.endsWith('DomainAvailabilityResponse'),
    typeName: 'DomainAvailabilityList',
  },
  {
    matches: schemaName => schemaName.includes('domain__domain') && schemaName.endsWith('DomainAvailabilityResponse'),
    typeName: 'DomainAvailabilityCheck',
  },
  // `Event` would shadow the DOM's global Event type in consumers' auto-imports.
  { matches: schemaName => schemaName === 'EventResponse', typeName: 'EventResponse' },
];

function lastPascalCaseSegment(name: string): string {
  if (!name.includes('__')) {
    return name;
  }
  const parts = name.split('__');
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^[A-Z][a-zA-Z0-9]*$/.test(parts[i])) {
      return parts[i];
    }
  }
  return parts[parts.length - 1];
}

export function toTypeName(schemaName: string, { keepResponseSuffix = false } = {}): string {
  const override = TYPE_NAME_OVERRIDES.find(candidate => candidate.matches(schemaName));
  if (override) {
    return override.typeName;
  }

  let name = schemaName.replace(/_+$/, '');
  name = name.replace(/-([a-zA-Z])/g, (_, c: string) => c.toUpperCase()).replace(/-/g, '');
  name = name.replace(/^BulkOperationResponse_/, '');
  name = lastPascalCaseSegment(name);

  return keepResponseSuffix ? name : name.replace(/Response$/, '');
}

export function moduleSegments(schemaName: string): string[] {
  if (!schemaName.includes('__')) {
    return [];
  }
  return schemaName.split('__').slice(0, -1);
}

export function toQualifier(segment: string): string {
  return toPascalCase(segment);
}

export function buildSchemasImport(types: string[]): string {
  if (types.length === 0) return '';
  return `import type {\n  ${types.join(',\n  ')},\n} from './schemas';`;
}

export function walkSchemas(node: unknown, visit: (schema: OpenAPISchema) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      walkSchemas(item, visit);
    }
    return;
  }
  if (node === null || typeof node !== 'object') {
    return;
  }
  visit(node as OpenAPISchema);
  for (const value of Object.values(node)) {
    walkSchemas(value, visit);
  }
}

export function assertUniqueExportNames(fileName: string, names: string[]): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      duplicates.add(name);
    }
    seen.add(name);
  }
  if (duplicates.size > 0) {
    throw new Error(
      [`Cannot generate ${fileName}: duplicate export names`, ...[...duplicates].sort().map(name => `  - ${name}`)].join('\n'),
    );
  }
}

export function writeGeneratedFile(relativePath: string, content: string): string {
  const outputPath = path.join(process.cwd(), relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content);
  return outputPath;
}
