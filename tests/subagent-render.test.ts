import { describe, expect, test } from 'bun:test';
import {
  contextUsageSeverity,
  formatSubagentCall,
  formatSubagentResultText,
} from '../extensions/subagent-render.ts';
import type { AgentResult } from '../extensions/subagent-executor.ts';

const result: AgentResult = {
  agent: 'scout',
  status: 'done',
  output: 'First paragraph.\n\nSecond paragraph.\n\n```ts\nconst x = 1;\n```\n\nThird paragraph.',
  tools: [
    { id: '1', name: 'read', args: { path: 'README.md' }, status: 'done' },
    { id: '2', name: 'grep', args: { pattern: 'TODO' }, status: 'running' },
  ],
  usage: {
    input: 1200,
    output: 345,
    cacheRead: 10,
    cacheWrite: 20,
    cost: 0.0123,
    contextTokens: 70000,
    contextWindow: 100000,
  },
  startedAt: 0,
  elapsedMs: 2345,
  model: 'anthropic/claude-haiku-4-5',
  isError: false,
  exitCode: 0,
  stderr: '',
};

describe('subagent rendering text', () => {
  test('classifies context usage thresholds for TUI coloring', () => {
    expect(contextUsageSeverity({ contextTokens: 69, contextWindow: 100 })).toBe('dim');
    expect(contextUsageSeverity({ contextTokens: 70, contextWindow: 100 })).toBe('warning');
    expect(contextUsageSeverity({ contextTokens: 90, contextWindow: 100 })).toBe('error');
    expect(contextUsageSeverity({ contextTokens: 0 })).toBe('dim');
  });

  test('formats collapsed call with agent and 60 character task preview', () => {
    expect(formatSubagentCall({ agent: 'scout', task: 'x'.repeat(80) })).toBe(
      `subagent scout ${'x'.repeat(60)}...`,
    );
  });

  test('formats expanded call with the complete task body', () => {
    const task = `line one\nline two ${'x'.repeat(80)}`;

    expect(formatSubagentCall({ agent: 'scout', task }, { expanded: true })).toBe(
      `subagent scout\n${task}`,
    );
  });

  test('renders nested subagent progress inline under the launching tool in expanded view', () => {
    const nested = {
      ...result,
      agent: 'researcher',
      status: 'running' as const,
      output: 'Still researching',
      tools: [
        {
          id: 'nested-1',
          name: 'webfetch',
          args: { url: 'https://example.com' },
          status: 'done' as const,
        },
      ],
      usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0 },
      elapsedMs: 1000,
      model: 'anthropic/claude-haiku-4-5',
    };
    const text = formatSubagentResultText(
      {
        ...result,
        tools: [
          {
            id: 'parent-1',
            name: 'subagent',
            args: { agent: 'researcher' },
            status: 'running',
            nested,
          },
        ],
      },
      { expanded: true },
    );

    expect(text).toContain('▸ subagent {"agent":"researcher"}');
    expect(text).toContain('  ▸ researcher (anthropic/claude-haiku-4-5) — 1 tools · 1s');
    expect(text).toContain('    webfetch {"url":"https://example.com"}');
  });

  test('formats collapsed result with status, tool logs, summary, and usage', () => {
    const text = formatSubagentResultText(result, { expanded: false });

    expect(text).toContain('✓ scout (anthropic/claude-haiku-4-5) — 2 tools · 2s');
    expect(text).toContain('  read {"path":"README.md"}');
    expect(text).toContain('▸ grep {"pattern":"TODO"}');
    expect(text).toContain('First paragraph.\nSecond paragraph.\nThird paragraph.');
    expect(text).toContain('↑1200 ↓345 R10 W20 $0.0123 70%/100000');
  });
});
