import fs from 'fs';
import path from 'path';
import { OpenAPISpec, generatePathName, toUpperSnakeCase } from './utils';

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

  const unionMembers = [...usedNames].map(name => `  | typeof ${name}`);
  lines.push('');
  lines.push(`export type Endpoint =\n${unionMembers.join('\n')};`);

  const outputPath = path.join(process.cwd(), 'src/helpers/endpoints.ts');
  fs.writeFileSync(outputPath, lines.join('\n') + '\n');
  console.log(`✅ Generated ${Object.keys(endpointNameMap).length} endpoint constants in ${outputPath}`);

  return endpointNameMap;
}
