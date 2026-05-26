import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { zodToJsonSchema } from 'zod-to-json-schema';

import { RegistrySchema } from './schemas/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(__dirname, '../../../schemas/registry.schema.json');

const jsonSchema = zodToJsonSchema(RegistrySchema, {
  name: 'Registry',
  $refStrategy: 'none',
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(jsonSchema, null, 2) + '\n');

console.log(`Generated JSON Schema at ${outputPath}`);
