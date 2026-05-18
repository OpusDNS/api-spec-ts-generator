import fs from 'fs';
import path from 'path';

export function generateIndex() {
  const content = [
    "export * from './keys';",
    "export * from './schemas';",
    "export * from './constants';",
    "export * from './responses';",
    "export * from './requests';",
    '',
  ].join('\n');

  const outputPath = path.join(process.cwd(), 'src/helpers/index.ts');
  fs.writeFileSync(outputPath, content);
  console.log(`✅ Generated index in ${outputPath}`);
}
