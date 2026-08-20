import fs from 'fs';
import path from 'path';
import { OpenAPISpec, toEnumKey, toUpperSnakeCase } from './utils';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

const RESOURCE_SCHEMA = 'PublicResource';
const SCOPE_SCHEMA = 'PublicScope';
const RESOURCE_CONST = toUpperSnakeCase(RESOURCE_SCHEMA);
const SCOPE_CONST = toUpperSnakeCase(SCOPE_SCHEMA);

interface EndpointPermissions {
  identifier: string;
  methods: Record<(typeof HTTP_METHODS)[number], string[]>;
}

function permissionMemberKey(permission: string): string {
  return permission.split(':').map(toEnumKey).join('_');
}

function permissionMemberValue(permission: string): string {
  const [resource, scope] = permission.split(':');
  return `\`\${${RESOURCE_CONST}.${toEnumKey(resource)}}:\${${SCOPE_CONST}.${toEnumKey(scope)}}\``;
}

function enumValues(spec: OpenAPISpec, schemaName: string): string[] {
  const values = spec.components?.schemas?.[schemaName]?.enum;
  if (!values || values.length === 0) {
    throw new Error(`Cannot generate permissions: schema '${schemaName}' is missing or has no enum values.`);
  }
  return values.map(String);
}

function buildPermissionList(resources: string[], scopes: string[]): string[] {
  return resources.flatMap(resource => scopes.map(scope => `${resource}:${scope}`)).sort();
}

function collect(
  spec: OpenAPISpec,
  endpointNameMap: Record<string, string>,
  resources: Set<string>,
  scopes: Set<string>,
): EndpointPermissions[] {
  const endpoints: EndpointPermissions[] = [];
  const unknown: string[] = [];

  for (const [pathStr, pathItem] of Object.entries(spec.paths ?? {})) {
    const methods = {} as EndpointPermissions['methods'];

    for (const method of HTTP_METHODS) {
      const requiredPermissions = pathItem[method]?.['x-required-permissions'] ?? [];
      for (const permission of requiredPermissions) {
        const [resource, scope] = permission.split(':');
        if (!resources.has(resource)) {
          unknown.push(`${pathStr} (${method}) requires '${permission}' but '${resource}' is not a member of the ${RESOURCE_SCHEMA} enum`);
        } else if (!scopes.has(scope)) {
          unknown.push(`${pathStr} (${method}) requires '${permission}' but '${scope}' is not a member of the ${SCOPE_SCHEMA} enum`);
        }
      }
      methods[method] = requiredPermissions.map(permissionMemberKey);
    }

    endpoints.push({ identifier: endpointNameMap[pathStr], methods });
  }

  if (unknown.length > 0) {
    throw new Error(
      [
        'Cannot generate permissions:',
        ...unknown.map(message => `  - ${message}`),
        'Add the missing values to the enums in the OpenAPI spec.',
      ].join('\n'),
    );
  }

  return endpoints;
}

function buildContent(
  endpoints: EndpointPermissions[],
  permissions: string[],
  publicPermissionType: string,
): string {
  const sortedEndpoints = [...endpoints].sort((a, b) => a.identifier.localeCompare(b.identifier));

  const endpointImport = [
    'import {',
    '  type Endpoint,',
    ...sortedEndpoints.map(e => `  ${e.identifier},`),
    "} from './endpoints';",
  ].join('\n');

  const lines: string[] = [
    `import type { ${publicPermissionType} } from './schemas';`,
    `import { ${RESOURCE_CONST}, ${SCOPE_CONST} } from './constants';`,
    endpointImport,
    '',
    "export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';",
    '',
    'export const PUBLIC_PERMISSION = {',
  ];

  for (const permission of permissions) {
    lines.push(`  ${permissionMemberKey(permission)}: ${permissionMemberValue(permission)},`);
  }

  lines.push(`} as const satisfies Record<string, ${publicPermissionType}>;`);
  lines.push('');
  lines.push('export const REQUIRED_PERMISSIONS = {');

  for (const endpoint of sortedEndpoints) {
    lines.push(`  [${endpoint.identifier}]: {`);
    for (const method of HTTP_METHODS) {
      const refs = endpoint.methods[method].map(key => `PUBLIC_PERMISSION.${key}`).join(', ');
      lines.push(`    ${method}: [${refs}],`);
    }
    lines.push('  },');
  }

  lines.push(`} as const satisfies Record<Endpoint, Record<HttpMethod, readonly ${publicPermissionType}[]>>;`);
  lines.push('');

  return lines.join('\n');
}

export function generatePermissions(
  spec: OpenAPISpec,
  schemaAliasMap: Record<string, string>,
  endpointNameMap: Record<string, string>,
) {
  const resources = enumValues(spec, RESOURCE_SCHEMA);
  const scopes = enumValues(spec, SCOPE_SCHEMA);
  const permissions = buildPermissionList(resources, scopes);
  const endpoints = collect(spec, endpointNameMap, new Set(resources), new Set(scopes));
  const publicPermissionType = schemaAliasMap['PublicPermission'] ?? 'PublicPermission';
  const content = buildContent(endpoints, permissions, publicPermissionType);
  const outputPath = path.join(process.cwd(), 'src/helpers/permissions.ts');
  fs.writeFileSync(outputPath, content);
  console.log(`✅ Generated ${permissions.length} permissions and required permissions map in ${outputPath}`);
}
