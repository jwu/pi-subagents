import { describe, expect, test } from 'bun:test';
import { homedir } from 'node:os';
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

    expect(text).toContain('▸ subagent researcher');
    expect(text).toContain('  ▸ researcher (anthropic/claude-haiku-4-5) — 1 tools · 1s');
    expect(text).toContain('    webfetch "https://example.com"');
  });

  test('formats tool logs like normal tool titles instead of JSON blobs', () => {
    const text = formatSubagentResultText(
      {
        ...result,
        tools: [
          {
            id: '1',
            name: 'ls',
            args: { path: `${homedir()}/dev/playground/pi-playground` },
            status: 'done',
          },
        ],
      },
      { expanded: false },
    );

    expect(text).toContain('  ls "~/dev/playground/pi-playground"');
    expect(text).not.toContain('{"path":');
  });

  test('formats running progress as tool log plus usage without output preview', () => {
    const text = formatSubagentResultText(
      {
        ...result,
        status: 'running',
        output: 'This should not be shown while running.',
        usage: {
          input: 99000,
          output: 5100,
          cacheRead: 401000,
          cacheWrite: 0,
          cost: 0.85,
          contextTokens: 44608,
          contextWindow: 272000,
        },
        elapsedMs: 90000,
      },
      { expanded: false },
    );

    expect(text).toContain('▸ scout (anthropic/claude-haiku-4-5) — 2 tools · 90s');
    expect(text).toContain('  read "README.md"');
    expect(text).toContain('▸ grep "TODO"');
    expect(text).not.toContain('This should not be shown while running.');
    expect(text).toContain('16.4%/272k ↑99k ↓5.1k R401k $0.850');
  });

  test('limits running tool logs to the latest 50 entries', () => {
    const tools = Array.from({ length: 73 }, (_, index) => ({
      id: String(index),
      name: 'read',
      args: { path: `file-${index}.md` },
      status: 'done' as const,
    }));

    const text = formatSubagentResultText(
      {
        ...result,
        status: 'running',
        tools,
      },
      { expanded: false },
    );

    expect(text).toContain('  ... 23 earlier tools');
    expect(text).not.toContain('file-22.md');
    expect(text).toContain('file-23.md');
    expect(text).toContain('file-72.md');
  });

  test('formats collapsed result with status, tool logs, summary, and usage', () => {
    const text = formatSubagentResultText(result, { expanded: false });

    expect(text).toContain('✓ scout (anthropic/claude-haiku-4-5) — 2 tools · 2s');
    expect(text).toContain('  read "README.md"');
    expect(text).toContain('▸ grep "TODO"');
    expect(text).toContain('\n\nFirst paragraph.\nSecond paragraph.\nThird paragraph.');
    expect(text).toContain('70.0%/100k ↑1.2k ↓345 R10 W20 $0.012');
  });
});
