import { OpenAPISpec, assertUniqueExportNames, toEnumKey, toSafeObjectKey, walkSchemas, writeGeneratedFile } from './utils';

function collectTypeIds(spec: OpenAPISpec): { prefixes: string[]; suffixPattern: string } {
  const prefixes = new Set<string>();
  const suffixPatterns = new Set<string>();
  const mismatches: string[] = [];

  walkSchemas(spec, schema => {
    const prefix = schema['x-typeid-prefix'];
    if (typeof prefix !== 'string') {
      return;
    }
    prefixes.add(prefix);
    if (schema.pattern === undefined) {
      return;
    }
    const expectedStart = `^${prefix}_`;
    if (!schema.pattern.startsWith(expectedStart)) {
      mismatches.push(`'${schema.pattern}' does not start with '${expectedStart}'`);
      return;
    }
    suffixPatterns.add(schema.pattern.slice(expectedStart.length));
  });

  if (mismatches.length > 0 || suffixPatterns.size > 1) {
    throw new Error(
      [
        'Cannot generate TypeID helpers: TypeID patterns are inconsistent.',
        ...mismatches.map(message => `  - ${message}`),
        ...(suffixPatterns.size > 1 ? [`  - suffix patterns differ: ${[...suffixPatterns].join(', ')}`] : []),
      ].join('\n'),
    );
  }

  const [suffixPattern] = suffixPatterns;
  if (suffixPattern === undefined) {
    throw new Error('Cannot generate TypeID helpers: no TypeID schema declares a pattern.');
  }

  return { prefixes: [...prefixes].sort(), suffixPattern };
}

export function generateTypeIds(spec: OpenAPISpec) {
  const { prefixes, suffixPattern } = collectTypeIds(spec);
  const memberKeys = prefixes.map(toEnumKey);
  assertUniqueExportNames('typeids.ts TYPEID_PREFIX', memberKeys);

  const pattern = new RegExp(`^(${prefixes.join('|')})_${suffixPattern.replace(/\$$/, '')}$`);

  const lines = [
    'export const TYPEID_PREFIX = {',
    ...prefixes.map((prefix, index) => `  ${toSafeObjectKey(memberKeys[index])}: '${prefix}',`),
    '} as const;',
    '',
    'export const TYPEID_PREFIX_VALUES = [',
    ...prefixes.map(prefix => `  '${prefix}',`),
    '] as const;',
    '',
    'export type TypeIdPrefix = (typeof TYPEID_PREFIX_VALUES)[number];',
    '',
    `export const TYPEID_PATTERN = ${pattern.toString()};`,
    '',
  ];

  const outputPath = writeGeneratedFile('src/helpers/typeids.ts', lines.join('\n'));
  console.log(`✅ Generated ${prefixes.length} TypeID prefixes in ${outputPath}`);
}
