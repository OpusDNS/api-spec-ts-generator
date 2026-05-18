import fs from 'fs';
import path from 'path';
import { OpenAPISpec, toTypeName } from './utils';

export function generateSchemas(spec: OpenAPISpec): Record<string, string> {
  const schemas = spec.components?.schemas ?? {};
  const schemaAliasMap: Record<string, string> = {};
  const usedTypeNames = new Set<string>();
  const lines: string[] = ["import { components } from '../schema';\n"];

  for (const schemaName of Object.keys(schemas).sort()) {
    let typeName = toTypeName(schemaName);
    const baseName = typeName;
    let counter = 2;
    while (usedTypeNames.has(typeName)) {
      typeName = `${baseName}${counter}`;
      counter++;
    }
    usedTypeNames.add(typeName);
    schemaAliasMap[schemaName] = typeName;
    lines.push(`export type ${typeName} = components['schemas']['${schemaName}'];`);
  }

  const outputPath = path.join(process.cwd(), 'src/helpers/schemas.d.ts');
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, lines.join('\n'));
  console.log(`✅ Generated ${Object.keys(schemas).length} schema aliases in ${outputPath}`);

  return schemaAliasMap;
}
