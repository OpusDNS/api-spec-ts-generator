import { OpenAPISpec, generatePathName, toUpperSnakeCase, writeGeneratedFile } from './utils';

export function generateEndpoints(spec: OpenAPISpec): Record<string, string> {
  const endpointNameMap: Record<string, string> = {};
  const usedNames = new Set<string>();
  const lines: string[] = [];

  for (const pathStr of Object.keys(spec.paths ?? {}).sort()) {
    let name = `${toUpperSnakeCase(generatePathName(pathStr))}_ENDPOINT`;
    const baseName = name;
    let counter = 2;
    while (usedNames.has(name)) {
      name = `${baseName}_${counter}`;
      counter++;
    }
    usedNames.add(name);
    endpointNameMap[pathStr] = name;
    lines.push(`export const ${name} = '${pathStr}';`);
  }

  lines.push('');
  lines.push('export const ENDPOINT_VALUES = [');
  lines.push(...[...usedNames].map(name => `  ${name},`));
  lines.push('] as const;');
  lines.push('');
  lines.push('export type Endpoint = (typeof ENDPOINT_VALUES)[number];');
  lines.push('');
  lines.push('const ENDPOINTS: ReadonlySet<string> = new Set(ENDPOINT_VALUES);');
  lines.push('');
  lines.push('export function isEndpoint(path: string): path is Endpoint {');
  lines.push('  return ENDPOINTS.has(path);');
  lines.push('}');

  const outputPath = writeGeneratedFile('src/helpers/endpoints.ts', lines.join('\n') + '\n');
  console.log(`✅ Generated ${Object.keys(endpointNameMap).length} endpoint constants in ${outputPath}`);

  return endpointNameMap;
}
