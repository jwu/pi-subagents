import { describe, expect, test } from 'bun:test';
import {
  appendAvailableSubagentsBlock,
  appendAvailableToolsAndGuidelinesBlock,
  formatAvailableSubagentsBlock,
  formatAvailableToolsAndGuidelinesBlock,
} from '../extensions/subagent-prompt.ts';

describe('subagent prompt helpers', () => {
  test('formats available subagents as standalone bullet block', () => {
    expect(formatAvailableSubagentsBlock(['worker', 'scout', 'scout'])).toBe(
      'Available subagents:\n- scout\n- worker',
    );
  });

  test('appends available subagents outside promptGuidelines content', () => {
    expect(appendAvailableSubagentsBlock('Base prompt.\n', ['worker', 'scout'])).toBe(
      'Base prompt.\n\nAvailable subagents:\n- scout\n- worker',
    );
  });

  test('formats available tools and guidelines from system prompt options', () => {
    expect(
      formatAvailableToolsAndGuidelinesBlock({
        selectedTools: ['read', 'grep', 'hidden'],
        toolSnippets: { read: 'Read file contents', grep: 'Search files' },
        promptGuidelines: ['Use read instead of cat.', 'Use read instead of cat.', '  '],
      }),
    ).toBe(
      [
        'Available tools:',
        '- read: Read file contents',
        '- grep: Search files',
        '',
        'In addition to the tools above, you may have access to other custom tools depending on the project.',
        '',
        'Guidelines:',
        '- Use read instead of cat.',
        '- Be concise in your responses',
        '- Show file paths clearly when working with files',
      ].join('\n'),
    );
  });

  test('appends available tools and guidelines before runtime metadata', () => {
    expect(
      appendAvailableToolsAndGuidelinesBlock('Agent prompt.\nCurrent date: 2026-06-02', {
        selectedTools: ['bash'],
        toolSnippets: { bash: 'Execute commands' },
        promptGuidelines: [],
      }),
    ).toBe(
      [
        'Agent prompt.',
        '',
        'Available tools:',
        '- bash: Execute commands',
        '',
        'In addition to the tools above, you may have access to other custom tools depending on the project.',
        '',
        'Guidelines:',
        '- Use bash for file operations like ls, rg, find',
        '- Be concise in your responses',
        '- Show file paths clearly when working with files',
        'Current date: 2026-06-02',
      ].join('\n'),
    );
  });

  test('does not append tools and guidelines when already present', () => {
    const prompt = 'Available tools:\n- read: Read file contents';
    expect(
      appendAvailableToolsAndGuidelinesBlock(prompt, {
        selectedTools: ['read'],
        toolSnippets: { read: 'Read file contents' },
      }),
    ).toBe(prompt);
  });
});
