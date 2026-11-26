import { OpenAPISpec, moduleSegments, toQualifier, toTypeName, writeGeneratedFile } from './utils';

function collisionGroups(assigned: Map<string, string>): string[][] {
  const byName = new Map<string, string[]>();
  for (const [schemaName, typeName] of assigned) {
    byName.set(typeName, [...(byName.get(typeName) ?? []), schemaName]);
  }
  return [...byName.values()].filter(group => group.length > 1);
}

function keepResponseSuffixWhereItDisambiguates(assigned: Map<string, string>): void {
  for (const group of collisionGroups(assigned)) {
    const strippedMembers = group.filter(
      schemaName => toTypeName(schemaName, { keepResponseSuffix: true }) !== assigned.get(schemaName),
    );
    if (strippedMembers.length === group.length) {
      continue;
    }
    for (const schemaName of strippedMembers) {
      assigned.set(schemaName, toTypeName(schemaName, { keepResponseSuffix: true }));
    }
  }
}

function qualifyByModulePath(assigned: Map<string, string>): void {
  for (const group of collisionGroups(assigned)) {
    const segmentsBySchema = new Map(
      group
        .map(schemaName => [schemaName, moduleSegments(schemaName)] as const)
        .filter(([, segments]) => segments.length > 0),
    );
    const unqualifiable = group.length - segmentsBySchema.size;
    if (segmentsBySchema.size === 0 || unqualifiable > 1) {
      continue;
    }
    while ([...segmentsBySchema.values()].every(segments => segments.length > 1)) {
      const lastSegments = new Set([...segmentsBySchema.values()].map(segments => segments[segments.length - 1]));
      if (lastSegments.size !== 1 || segmentsBySchema.size === 1) {
        break;
      }
      for (const segments of segmentsBySchema.values()) {
        segments.pop();
      }
    }
    for (const [schemaName, segments] of segmentsBySchema) {
      assigned.set(schemaName, `${assigned.get(schemaName)}${toQualifier(segments[segments.length - 1])}`);
    }
  }
}

function suffixRemainingCollisions(assigned: Map<string, string>): void {
  for (const group of collisionGroups(assigned)) {
    const [, ...rest] = [...group].sort();
    rest.forEach((schemaName, index) => {
      const collidingName = assigned.get(schemaName);
      const typeName = `${collidingName}${index + 2}`;
      console.warn(`⚠️  Schema '${schemaName}' collides on '${collidingName}'; falling back to '${typeName}'.`);
      assigned.set(schemaName, typeName);
    });
  }
}

export function resolveTypeNames(schemaNames: string[]): Record<string, string> {
  const assigned = new Map(schemaNames.map(schemaName => [schemaName, toTypeName(schemaName)]));
  keepResponseSuffixWhereItDisambiguates(assigned);
  qualifyByModulePath(assigned);
  suffixRemainingCollisions(assigned);
  return Object.fromEntries(assigned);
}

export function generateSchemas(spec: OpenAPISpec): Record<string, string> {
  const schemas = spec.components?.schemas ?? {};
  const schemaNames = Object.keys(schemas).sort();
  const schemaAliasMap = resolveTypeNames(schemaNames);
  const lines: string[] = ["import { components } from '../schema';\n"];

  for (const schemaName of schemaNames) {
    lines.push(`export type ${schemaAliasMap[schemaName]} = components['schemas']['${schemaName}'];`);
  }

  const outputPath = writeGeneratedFile('src/helpers/schemas.d.ts', lines.join('\n'));
  console.log(`✅ Generated ${schemaNames.length} schema aliases in ${outputPath}`);

  return schemaAliasMap;
}
