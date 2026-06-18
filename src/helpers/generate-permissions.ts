import fs from 'fs';
import path from 'path';
import { OpenAPISpec, toEnumKey } from './utils';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

interface EndpointPermissions {
  identifier: string;
  methods: Record<(typeof HTTP_METHODS)[number], string[]>;
}

function permissionMemberKey(permission: string): string {
  return permission.split(':').map(toEnumKey).join('_');
}

function permissionMemberValue(permission: string): string {
  const [resource, scope] = permission.split(':');
  return `\`\${PUBLIC_RESOURCE.${toEnumKey(resource)}}:\${PUBLIC_SCOPE.${toEnumKey(scope)}}\``;
}

function collect(
  spec: OpenAPISpec,
  endpointNameMap: Record<string, string>,
): { endpoints: EndpointPermissions[]; permissions: Set<string> } {
  const endpoints: EndpointPermissions[] = [];
  const permissions = new Set<string>();

  for (const [pathStr, pathItem] of Object.entries(spec.paths ?? {})) {
    const methods = {} as EndpointPermissions['methods'];

    for (const method of HTTP_METHODS) {
      const requiredPermissions = pathItem[method]?.['x-required-permissions'] ?? [];
      for (const permission of requiredPermissions) {
        permissions.add(permission);
      }
      methods[method] = requiredPermissions.map(permissionMemberKey);
    }

    endpoints.push({ identifier: endpointNameMap[pathStr], methods });
  }

  return { endpoints, permissions };
}

function buildContent(
  endpoints: EndpointPermissions[],
  permissions: Set<string>,
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
    "import { PUBLIC_RESOURCE, PUBLIC_SCOPE } from './constants';",
    endpointImport,
    '',
    "export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';",
    '',
    'export const PUBLIC_PERMISSION = {',
  ];

  for (const permission of [...permissions].sort()) {
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
  const { endpoints, permissions } = collect(spec, endpointNameMap);
  const publicPermissionType = schemaAliasMap['PublicPermission'] ?? 'PublicPermission';
  const content = buildContent(endpoints, permissions, publicPermissionType);
  const outputPath = path.join(process.cwd(), 'src/helpers/permissions.ts');
  fs.writeFileSync(outputPath, content);
  console.log(`✅ Generated required permissions map in ${outputPath}`);
}
