#!/usr/bin/env tsx

import fs, { PathOrFileDescriptor } from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { toTypeName } from './utils';

function generateDirectSchemaAliases(openAPIContent: string): string {
  // Parse the OpenAPI YAML
  const spec = yaml.load(openAPIContent) as any;
  const schemas = spec.components?.schemas || {};
  const lines: string[] = [];
  lines.push('/**');
  lines.push(' * Direct type aliases for OpenAPI schemas');
  lines.push(' *');
  lines.push(' * This file contains TypeScript type aliases that directly reference OpenAPI schema definitions.');
  lines.push(' * Each type alias provides a clean, developer-friendly name for the corresponding OpenAPI schema.');
  lines.push(' * These types are used throughout the API for request/response objects and data structures.');
  lines.push(' *');
  lines.push(' * @remarks');
  lines.push(' * - All types follow the pattern: `TypeName = components[\'schemas\'][\'SchemaName\']`');
  lines.push(' * - Type names are automatically generated from OpenAPI schema names');
  lines.push(' * - Each type includes documentation from the original OpenAPI schema');
  lines.push(' * - These types ensure type safety when working with API data');
  lines.push(' *');
  lines.push(' * @example');
  lines.push(' * ```typescript');
  lines.push(' * // Using schema types for API responses');
  lines.push(' * const response = await api.getDomain(\'example.com\');');
  lines.push(' * const domain: Domain = response.results;');
  lines.push(' * ');
  lines.push(' * const contactsResponse = await api.getContacts();');
  lines.push(' * const contacts: Contact[] = contactsResponse.results;');
  lines.push(' * ```');
  lines.push(' *');
  lines.push(' * This file is auto-generated from the OpenAPI specification.');
  lines.push(' * Do not edit manually.');
  lines.push(' */');
  lines.push("import { components } from '../schema';\n");

  // Track used type names to avoid duplicates
  const usedTypeNames = new Set<string>();

  Object.keys(schemas).sort().forEach((schemaName) => {
    let typeName = toTypeName(schemaName);
    // Ensure uniqueness
    const originalTypeName = typeName;
    let i = 2;
    while (usedTypeNames.has(typeName)) {
      typeName = `${originalTypeName}${i}`;
      i++;
    }
    usedTypeNames.add(typeName);

    // Get schema information for documentation
    const schema = schemas[schemaName];
    const title = schema?.title || typeName;
    const description = schema?.description || '';

    // Generate TSDoc comment for each type
    lines.push(`/**`);
    lines.push(` * ${title}${description ? `. ${description}` : ''}`);
    lines.push(` *`);
    lines.push(` * @remarks`);
    lines.push(` * Type alias for the \`${schemaName}\` OpenAPI schema.`);
    lines.push(` * This type represents ${title.toLowerCase()} data structures used in API requests and responses.`);
    lines.push(` *`);
    lines.push(` * @example`);
    lines.push(` * \`\`\`typescript`);
    lines.push(` * const response = await api.get${typeName}();`);
    lines.push(` * const item: ${typeName} = response.results;`);
    lines.push(` * \`\`\``);
    lines.push(` *`);
    lines.push(` * @see {@link components} - The OpenAPI components schema definition`);
    lines.push(` */`);
    lines.push(`export type ${typeName} = components['schemas']['${schemaName}'];`);
  });

  return lines.join('\n');
}

export function generateSchemas(schemaPath: PathOrFileDescriptor) {
  try {
    const openAPIContent = fs.readFileSync(schemaPath, 'utf-8');

    // Generate direct schema aliases only
    const directAliasesContent = generateDirectSchemaAliases(openAPIContent);

    // Write the direct aliases content to the file
    const outputPath = path.join(process.cwd(), 'src/helpers/schemas.d.ts');

    // Ensure the directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, directAliasesContent);

    console.log(
      `✅ Generated direct schema aliases for ${Object.keys((yaml.load(openAPIContent) as any).components?.schemas || {}).length} schemas in ${outputPath}`,
    );

    return Object.keys((yaml.load(openAPIContent) as any).components?.schemas || {}).length;
  } catch (error) {
    console.error('❌ Error generating schema aliases:', error);
    process.exit(1);
  }
}
