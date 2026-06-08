import { describe, it, expect } from 'vitest';
import matter from '@11ty/gray-matter';
import { FrontmatterSchema } from '@offlinedocs/shared';

import { generateFrontmatter, extractTopics } from './frontmatter-generator.js';

describe('generateFrontmatter', () => {
  it('generates frontmatter with title, library, and topics', () => {
    const result = generateFrontmatter('Hooks', 'react', '## Hooks\n\nHooks let you use state and lifecycle features.');
    expect(result.frontmatter.title).toBe('Hooks');
    expect(result.frontmatter.library).toBe('react');
    expect(result.frontmatter.topics).toBeInstanceOf(Array);
    expect(result.frontmatter.topics.length).toBeGreaterThan(0);
  });

  it('uses gray-matter to serialize content with frontmatter', () => {
    const result = generateFrontmatter('Hooks', 'react', 'Some content here.');
    // Parse the output back with gray-matter to verify format
    const parsed = matter(result.serialized);
    expect(parsed.data.title).toBe('Hooks');
    expect(parsed.data.library).toBe('react');
    expect(parsed.data.topics).toBeInstanceOf(Array);
    expect(parsed.content.trim()).toBe('Some content here.');
  });

  it('includes part field when provided', () => {
    const result = generateFrontmatter('API Reference', 'react', 'Content.', 2);
    expect(result.frontmatter.part).toBe(2);
    const parsed = matter(result.serialized);
    expect(parsed.data.part).toBe(2);
  });

  it('omits part field when not provided', () => {
    const result = generateFrontmatter('API Reference', 'react', 'Content.');
    expect(result.frontmatter.part).toBeUndefined();
    const parsed = matter(result.serialized);
    expect(parsed.data.part).toBeUndefined();
  });

  it('validates output against FrontmatterSchema', () => {
    const result = generateFrontmatter('Hooks', 'react', 'Some hooks content.');
    const validation = FrontmatterSchema.safeParse(result.frontmatter);
    expect(validation.success).toBe(true);
  });
});

describe('extractTopics', () => {
  it('extracts meaningful keywords from heading and content', () => {
    const topics = extractTopics('React Hooks', 'Hooks let you use state and lifecycle features in function components.');
    expect(topics.length).toBeGreaterThan(0);
    expect(topics.length).toBeLessThanOrEqual(8);
    // Should include words from the heading
    expect(topics).toContain('react');
    expect(topics).toContain('hooks');
  });

  it('filters out common stop words', () => {
    const topics = extractTopics('The Best Guide', 'This is a guide for the new API.');
    expect(topics).not.toContain('the');
    expect(topics).not.toContain('is');
    expect(topics).not.toContain('a');
    expect(topics).not.toContain('for');
  });

  it('lowercases all topics', () => {
    const topics = extractTopics('React Hooks', 'Using React hooks effectively.');
    for (const topic of topics) {
      expect(topic).toBe(topic.toLowerCase());
    }
  });

  it('limits topics to max 8', () => {
    const topics = extractTopics(
      'Very Long Heading With Many Words Here',
      'This content has many unique important significant relevant meaningful keywords throughout.',
    );
    expect(topics.length).toBeLessThanOrEqual(8);
  });

  it('handles empty content', () => {
    const topics = extractTopics('Title', '');
    expect(topics.length).toBeGreaterThan(0);
    expect(topics).toContain('title');
  });
});
