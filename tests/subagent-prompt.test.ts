import { describe, expect, test } from 'bun:test';
import {
  AUTO_RUNTIME_TOOLS_MARKER,
  LEGACY_RUNTIME_TOOLS_MARKER,
  formatAvailableToolsAndGuidelinesBlock,
  injectRuntimeToolsBlock,
} from '../extensions/subagent-prompt.ts';

describe('subagent prompt helpers', () => {
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

  test('replaces the internal runtime tools marker', () => {
    expect(
      injectRuntimeToolsBlock(
        `Agent prompt.\n\n${AUTO_RUNTIME_TOOLS_MARKER}\n\nCurrent working directory: /repo`,
        {
          selectedTools: ['bash'],
          toolSnippets: { bash: 'Execute commands' },
          promptGuidelines: [],
        },
      ),
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
        '',
        'Current working directory: /repo',
      ].join('\n'),
    );
  });

  test('replaces the legacy marker when an existing parent process supplies it', () => {
    expect(
      injectRuntimeToolsBlock(`Agent prompt.\n${LEGACY_RUNTIME_TOOLS_MARKER}`, {
        selectedTools: ['read'],
        toolSnippets: { read: 'Read file contents' },
      }),
    ).toContain('Available tools:\n- read: Read file contents');
  });

  test('renders an explicit empty tools block when no runtime tools are available', () => {
    expect(
      injectRuntimeToolsBlock(`Agent prompt.\n${AUTO_RUNTIME_TOOLS_MARKER}`, { selectedTools: [] }),
    ).toContain('Available tools:\n(none)');
  });
});
