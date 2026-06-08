import { describe, it, expect } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadConfig } from './config-loader.js';

async function writeTempToml(content: string): Promise<{ dir: string; filePath: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'offlinedocs-test-'));
  const filePath = join(dir, 'libraries.toml');
  await writeFile(filePath, content, 'utf-8');
  return { dir, filePath };
}

const VALID_TOML_3_SOURCES = `
[[library]]
id = "react"
name = "React"
sourceType = "llms-txt"
sourceUrl = "https://react.dev/llms.txt"

[[library]]
id = "express"
name = "Express"
sourceType = "github"
sourceUrl = "https://github.com/expressjs/express/tree/main/docs"

[[library]]
id = "nextjs"
name = "Next.js"
sourceType = "context7"
sourceUrl = "/vercel/next.js"
`;

describe('loadConfig', () => {
  it('loads a valid TOML with 3 source types and returns 3 LibraryConfig objects', async () => {
    const { dir, filePath } = await writeTempToml(VALID_TOML_3_SOURCES);
    try {
      const result = await loadConfig(filePath);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toHaveLength(3);
      expect(result.data[0]).toEqual({
        id: 'react',
        name: 'React',
        sourceType: 'llms-txt',
        sourceUrl: 'https://react.dev/llms.txt',
      });
      expect(result.data[1]).toEqual({
        id: 'express',
        name: 'Express',
        sourceType: 'github',
        sourceUrl: 'https://github.com/expressjs/express/tree/main/docs',
      });
      expect(result.data[2]).toEqual({
        id: 'nextjs',
        name: 'Next.js',
        sourceType: 'context7',
        sourceUrl: '/vercel/next.js',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('validates llms-txt source type entry', async () => {
    const toml = `
[[library]]
id = "react"
name = "React"
sourceType = "llms-txt"
sourceUrl = "https://react.dev/llms.txt"
`;
    const { dir, filePath } = await writeTempToml(toml);
    try {
      const result = await loadConfig(filePath);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data[0]!.sourceType).toBe('llms-txt');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('validates github source type entry', async () => {
    const toml = `
[[library]]
id = "express"
name = "Express"
sourceType = "github"
sourceUrl = "https://github.com/expressjs/express/tree/main/docs"
`;
    const { dir, filePath } = await writeTempToml(toml);
    try {
      const result = await loadConfig(filePath);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data[0]!.sourceType).toBe('github');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('validates context7 source type entry', async () => {
    const toml = `
[[library]]
id = "nextjs"
name = "Next.js"
sourceType = "context7"
sourceUrl = "/vercel/next.js"
`;
    const { dir, filePath } = await writeTempToml(toml);
    try {
      const result = await loadConfig(filePath);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data[0]!.sourceType).toBe('context7');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns CONFIG_INVALID error with entry and field info for missing required field', async () => {
    const toml = `
[[library]]
id = "react"
name = "React"
sourceType = "llms-txt"
`;
    const { dir, filePath } = await writeTempToml(toml);
    try {
      const result = await loadConfig(filePath);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('CONFIG_INVALID');
      expect(result.error.libraryId).toBe('react');
      expect(result.error.message).toMatch(/sourceUrl/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns CONFIG_INVALID error with parse message for malformed TOML', async () => {
    const toml = `
[[library
id = "react"
this is not valid toml!!!
`;
    const { dir, filePath } = await writeTempToml(toml);
    try {
      const result = await loadConfig(filePath);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('CONFIG_INVALID');
      expect(result.error.message).toBeTruthy();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns CONFIG_INVALID error when file does not exist', async () => {
    const result = await loadConfig('/nonexistent/path/libraries.toml');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CONFIG_INVALID');
  });

  it('returns CONFIG_INVALID error for invalid sourceType', async () => {
    const toml = `
[[library]]
id = "react"
name = "React"
sourceType = "invalid-type"
sourceUrl = "https://example.com"
`;
    const { dir, filePath } = await writeTempToml(toml);
    try {
      const result = await loadConfig(filePath);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('CONFIG_INVALID');
      expect(result.error.message).toMatch(/sourceType/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
