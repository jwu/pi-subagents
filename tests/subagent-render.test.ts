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

  test('adds a blank line before the result status in collapsed and expanded views', () => {
    expect(formatSubagentResultText(result, { expanded: false })).toStartWith(
      '\n✓ scout (anthropic/claude-haiku-4-5)',
    );
    expect(formatSubagentResultText(result, { expanded: true })).toStartWith(
      '\n✓ scout (anthropic/claude-haiku-4-5)',
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
    expect(text).toContain('    webfetch https://example.com');
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

    expect(text).toContain('  ls ~/dev/playground/pi-playground');
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
    expect(text).toContain('  read README.md');
    expect(text).toContain('▸ grep /TODO/ in .');
    expect(text).not.toContain('This should not be shown while running.');
    expect(text).toContain('16.4%/272k ↑99k ↓5.1k R401k $0.850');
  });

  test('limits collapsed running tool logs to the latest 20 entries', () => {
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

    expect(text).toContain('  ... (53 earlier tool calls, to expand)');
    expect(text).not.toContain('file-52.md');
    expect(text).toContain('file-53.md');
    expect(text).toContain('file-72.md');
  });

  test('shows all running tool logs in expanded view', () => {
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
      { expanded: true },
    );

    expect(text).not.toContain('earlier tool calls, to expand');
    expect(text).toContain('file-0.md');
    expect(text).toContain('file-72.md');
  });

  test('keeps full long paths in text formatting without render width pressure', () => {
    const text = formatSubagentResultText(
      {
        ...result,
        tools: [
          {
            id: 'read-long',
            name: 'read',
            args: {
              path: '~/dev/playground/pi-playground/.pi/npm/node_modules/pi-messenger/config/schema.ts',
              offset: 1,
              limit: 30,
            },
            status: 'done',
          },
        ],
      },
      { expanded: false },
    );

    expect(text).toContain(
      '  read ~/dev/playground/pi-playground/.pi/npm/node_modules/pi-messenger/config/schema.ts:1-30',
    );
  });

  test('formats built-in and common extension tool logs like their renderCall titles', () => {
    const text = formatSubagentResultText(
      {
        ...result,
        tools: [
          {
            id: 'read',
            name: 'read',
            args: { path: 'README.md', offset: 3, limit: 2 },
            status: 'done',
          },
          { id: 'bash', name: 'bash', args: { command: 'bun test', timeout: 30 }, status: 'done' },
          { id: 'edit', name: 'edit', args: { path: 'src/app.ts' }, status: 'done' },
          { id: 'write', name: 'write', args: { path: 'src/new.ts' }, status: 'done' },
          {
            id: 'find',
            name: 'find',
            args: { pattern: '*.ts', path: 'src', limit: 5 },
            status: 'done',
          },
          {
            id: 'grep',
            name: 'grep',
            args: { pattern: 'TODO', path: 'src', glob: '*.ts', limit: 10 },
            status: 'done',
          },
          { id: 'ls', name: 'ls', args: { path: 'src', limit: 3 }, status: 'done' },
          {
            id: 'webfetch',
            name: 'webfetch',
            args: { url: 'https://example.com', mode: 'text' },
            status: 'done',
          },
          {
            id: 'subagent',
            name: 'subagent',
            args: { agent: 'researcher', task: 'Investigate' },
            status: 'done',
          },
        ],
      },
      { expanded: false },
    );

    expect(text).toContain('  read README.md:3-4');
    expect(text).toContain('  $ bun test (timeout 30s)');
    expect(text).toContain('  edit src/app.ts');
    expect(text).toContain('  write src/new.ts');
    expect(text).toContain('  find *.ts in src (limit 5)');
    expect(text).toContain('  grep /TODO/ in src (*.ts) limit 10');
    expect(text).toContain('  ls src (limit 3)');
    expect(text).toContain('  webfetch https://example.com (text)');
    expect(text).toContain('  subagent researcher "Investigate"');
  });

  test('collapsed output summary preserves code blocks instead of stripping them', () => {
    const output = 'Before\n\n```ts\nconst x = 1;\n```\n\nAfter';
    const text = formatSubagentResultText({ ...result, output }, { expanded: false });

    expect(text).toContain('```ts');
    expect(text).toContain('const x = 1;');
    expect(text).toContain('```');
  });

  test('collapsed output summary preserves empty lines instead of filtering them', () => {
    const output = 'line1\n\n\nline4';
    const text = formatSubagentResultText({ ...result, output }, { expanded: false });

    // Should contain the blank line between line1 and line4
    const lines = text.split('\n');
    const outputStart = lines.findIndex((l) => l === 'line1');
    expect(outputStart).not.toBe(-1);
    expect(lines[outputStart + 1]).toBe('');
    expect(lines[outputStart + 2]).toBe('');
    expect(lines[outputStart + 3]).toBe('line4');
  });

  test('appends truncation hint when collapsed output exceeds 20 lines', () => {
    const output = Array.from({ length: 25 }, (_, index) => `line ${index + 1}`).join('\n');
    const text = formatSubagentResultText({ ...result, output }, { expanded: false });

    expect(text).toContain('... (5 more lines');
    expect(text).toContain('to expand');
  });

  test('does not append truncation hint when collapsed output is 20 lines or fewer', () => {
    const output = Array.from({ length: 15 }, (_, index) => `line ${index + 1}`).join('\n');
    const text = formatSubagentResultText({ ...result, output }, { expanded: false });

    expect(text).not.toContain('more lines');
  });

  test('limits collapsed output summary to 20 logical lines', () => {
    const output = Array.from({ length: 25 }, (_, index) => `summary line ${index + 1}`).join('\n');
    const text = formatSubagentResultText({ ...result, output }, { expanded: false });

    expect(text).toContain('summary line 1');
    expect(text).toContain('summary line 20');
    expect(text).not.toContain('summary line 21');
  });

  test('does not stop collapsed output summary at three paragraphs', () => {
    const output = Array.from({ length: 6 }, (_, index) => `paragraph ${index + 1}`).join('\n\n');
    const text = formatSubagentResultText({ ...result, output }, { expanded: false });

    expect(text).toContain('paragraph 1');
    expect(text).toContain('paragraph 4');
    expect(text).toContain('paragraph 6');
  });

  test('formats collapsed result with status, tool logs, summary, and usage', () => {
    const text = formatSubagentResultText(result, { expanded: false });

    expect(text).toContain('✓ scout (anthropic/claude-haiku-4-5) — 2 tools · 2s');
    expect(text).toContain('  read README.md');
    expect(text).toContain('▸ grep /TODO/ in .');
    expect(text).toContain(
      'First paragraph.\n\nSecond paragraph.\n\n```ts\nconst x = 1;\n```\n\nThird paragraph.',
    );
    expect(text).toContain('70.0%/100k ↑1.2k ↓345 R10 W20 $0.012');
  });
});
