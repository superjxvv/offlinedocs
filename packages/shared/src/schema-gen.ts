import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod/v4';

import { RegistrySchema } from './schemas/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(__dirname, '../../../schemas/registry.schema.json');

const jsonSchema = z.toJSONSchema(RegistrySchema);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(jsonSchema, null, 2) + '\n');

console.log(`Generated JSON Schema at ${outputPath}`);
