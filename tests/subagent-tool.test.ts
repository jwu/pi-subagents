import { describe, expect, test } from 'bun:test';
import { initTheme } from '@earendil-works/pi-coding-agent';
import { registerSubagentTool } from '../extensions/subagent-tool.ts';
import type { AgentConfig } from '../extensions/agent-loader.ts';
import type { AgentResult } from '../extensions/subagent-executor.ts';

const agent: AgentConfig = {
  name: 'scout',
  tools: ['read'],
  thinking: 'off',
  systemPromptMode: 'replace',
  maxDepth: 10,
  debug: false,
  prompt: 'Scout.',
  source: 'global',
  filePath: '/agents/scout.md',
};

initTheme();

const testTheme = {
  fg: (_name: string, text: string) => text,
  bold: (text: string) => text,
};

const markerTheme = {
  fg: (name: string, text: string) => `<${name}>${text}</${name}>`,
  bold: (text: string) => `<bold>${text}</bold>`,
};

describe('registerSubagentTool', () => {
  test('filters registered agents through PI_SUBAGENT_ALLOWED', async () => {
    const registered: any[] = [];
    const writer: AgentConfig = { ...agent, name: 'writer' };

    registerSubagentTool(
      { registerTool: (tool: unknown) => registered.push(tool) },
      {
        agents: [agent, writer],
        env: { PI_SUBAGENT_ALLOWED: 'scout' },
        run: async () => {
          throw new Error('writer should not run');
        },
      },
    );

    await expect(
      registered[0].execute(
        'call-1',
        { agent: 'writer', task: 'Edit code' },
        undefined,
        undefined,
        { cwd: '/repo' },
      ),
    ).rejects.toThrow('Unknown agent: writer. Available agents: scout.');
  });

  test('does not register subagent when current process is past max depth', () => {
    const registered: any[] = [];

    registerSubagentTool(
      { registerTool: (tool: unknown) => registered.push(tool) },
      {
        agents: [agent],
        env: { PI_SUBAGENT_DEPTH: '2', PI_SUBAGENT_MAX_DEPTH: '1' },
      },
    );

    expect(registered).toEqual([]);
  });

  test('passes incremented depth while current process is within max depth', async () => {
    const registered: any[] = [];

    registerSubagentTool(
      { registerTool: (tool: unknown) => registered.push(tool) },
      {
        agents: [agent],
        env: { PI_SUBAGENT_DEPTH: '2', PI_SUBAGENT_MAX_DEPTH: '3' },
        run: async (options) => {
          expect(options.depth).toBe(3);
          return {
            agent: 'scout',
            status: 'done',
            output: 'ok',
            tools: [],
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0 },
            startedAt: 1,
            elapsedMs: 2,
            isError: false,
            exitCode: 0,
            stderr: '',
          };
        },
      },
    );

    expect(registered).toHaveLength(1);
    await registered[0].execute(
      'call-1',
      { agent: 'scout', task: 'List files' },
      undefined,
      undefined,
      {
        cwd: '/repo',
      },
    );
  });

  test('merges per-call signal with process signal so both can abort the subagent spawn', async () => {
    const registered: any[] = [];
    const perCallController = new AbortController();
    const processController = new AbortController();

    let capturedSignal: AbortSignal | undefined;

    registerSubagentTool(
      { registerTool: (tool: unknown) => registered.push(tool) },
      {
        agents: [agent],
        processSignal: processController.signal,
        run: async (options) => {
          capturedSignal = options.signal;
          return {
            agent: 'scout',
            status: 'done',
            output: 'ok',
            tools: [],
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0 },
            startedAt: 1,
            elapsedMs: 2,
            isError: false,
            exitCode: 0,
            stderr: '',
          };
        },
      },
    );

    expect(registered).toHaveLength(1);

    // Execute with per-call signal only — process signal should be merged
    await registered[0].execute(
      'call-1',
      { agent: 'scout', task: 'List files' },
      perCallController.signal,
      undefined,
      { cwd: '/repo' },
    );

    // Neither aborted yet
    expect(capturedSignal?.aborted).toBe(false);

    // Abort per-call → merged signal should abort
    perCallController.abort();
    expect(capturedSignal?.aborted).toBe(true);

    // New call — per-call not aborted yet, process not aborted
    await registered[0].execute(
      'call-2',
      { agent: 'scout', task: 'List files again' },
      new AbortController().signal,
      undefined,
      { cwd: '/repo' },
    );
    expect(capturedSignal?.aborted).toBe(false);

    // Abort process → merged signal should abort
    processController.abort();
    // Need a new call to capture the merged signal after process abort
    await registered[0].execute(
      'call-3',
      { agent: 'scout', task: 'Final call' },
      undefined,
      undefined,
      { cwd: '/repo' },
    );
    expect(capturedSignal?.aborted).toBe(true);
  });

  test('highlights expanded subagent call title and task body like collapsed preview', () => {
    const registered: any[] = [];

    registerSubagentTool(
      { registerTool: (tool: unknown) => registered.push(tool) },
      { agents: [agent] },
    );

    const rendered = registered[0]
      .renderCall({ agent: 'scout', task: 'Line one\nLine two' }, markerTheme, { expanded: true })
      .render(120)
      .join('\n');

    expect(rendered).toContain(
      '<toolTitle><bold>subagent</bold></toolTitle> <accent>scout</accent>',
    );
    expect(rendered).toContain('<dim>Line one');
    expect(rendered).toContain('Line two</dim>');
  });

  test('renders a blank line before result status in collapsed and expanded views', () => {
    const registered: any[] = [];
    const details: AgentResult = {
      agent: 'scout',
      status: 'done',
      output: 'ok',
      tools: [],
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0 },
      startedAt: 1,
      elapsedMs: 2,
      isError: false,
      exitCode: 0,
      stderr: '',
    };

    registerSubagentTool(
      { registerTool: (tool: unknown) => registered.push(tool) },
      { agents: [agent] },
    );

    const collapsed = registered[0]
      .renderResult({ content: [], details }, { expanded: false }, testTheme)
      .render(120)
      .map((line: string) => line.trimEnd());
    const expanded = registered[0]
      .renderResult({ content: [], details }, { expanded: true }, testTheme)
      .render(120)
      .map((line: string) => line.trimEnd());

    expect(collapsed[0]).toBe('');
    expect(collapsed[1]).toStartWith('✓ scout');
    expect(expanded[0]).toBe('');
    expect(expanded[1]).toStartWith('✓ scout');
  });

  test('highlights collapsed hidden hint as dim and tool rows like renderCall titles', () => {
    const registered: any[] = [];
    const details: AgentResult = {
      agent: 'scout',
      status: 'done',
      output: 'ok',
      tools: [
        ...Array.from({ length: 24 }, (_, index) => ({
          id: `read-${index}`,
          name: 'read',
          args: { path: `old-${index}.md` },
          status: 'done' as const,
        })),
        {
          id: 'ls-1',
          name: 'ls',
          args: { path: '~/dev/playground/pi-playground/.pi/npm/node_modules/pi-subagents' },
          status: 'done' as const,
        },
        {
          id: 'grep-1',
          name: 'grep',
          args: {
            pattern: 'scrapling-api-guide|scrapling',
            path: '~/dev/playground/pi-playground',
            glob: '*.md',
            limit: 30,
          },
          status: 'done' as const,
        },
      ],
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0 },
      startedAt: 1,
      elapsedMs: 2,
      isError: false,
      exitCode: 0,
      stderr: '',
    };

    registerSubagentTool(
      { registerTool: (tool: unknown) => registered.push(tool) },
      { agents: [agent] },
    );

    const lines = registered[0]
      .renderResult({ content: [], details }, { expanded: false }, markerTheme)
      .render(1000)
      .map((line: string) => line.trimEnd());

    const hint = lines.find((line: string) => line.includes('earlier tool calls'));
    expect(hint).toStartWith('<dim>  ... (');
    expect(hint).toEndWith('</dim>');

    const ls = lines.find((line: string) => line.includes('pi-subagents'));
    expect(ls).toContain('  <toolTitle><bold>ls</bold></toolTitle>');
    expect(ls).toContain(
      '<accent>~/dev/playground/pi-playground/.pi/npm/node_modules/pi-subagents</accent>',
    );

    const grep = lines.find((line: string) => line.includes('scrapling-api-guide'));
    expect(grep).toContain(
      '<toolTitle><bold>grep</bold></toolTitle> <syntaxKeyword>/scrapling-api-guide|scrapling/</syntaxKeyword><dim> in </dim><accent>~/dev/playground/pi-playground</accent><muted> (*.md)</muted><toolOutput> limit 30</toolOutput>',
    );
  });

  test('highlights expanded tool rows while preserving markdown output rendering', () => {
    const registered: any[] = [];
    const details: AgentResult = {
      agent: 'scout',
      status: 'done',
      output: '# Report\n\nFinal **markdown** output.',
      tools: [
        {
          id: 'grep-1',
          name: 'grep',
          args: { pattern: 'TODO', path: '~/repo', glob: '*.ts', limit: 5 },
          status: 'done' as const,
        },
      ],
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0 },
      startedAt: 1,
      elapsedMs: 2,
      isError: false,
      exitCode: 0,
      stderr: '',
    };

    registerSubagentTool(
      { registerTool: (tool: unknown) => registered.push(tool) },
      { agents: [agent] },
    );

    const rendered = registered[0]
      .renderResult({ content: [], details }, { expanded: true }, markerTheme)
      .render(1000)
      .join('\n');

    expect(rendered).toContain(
      '<toolTitle><bold>grep</bold></toolTitle> <syntaxKeyword>/TODO/</syntaxKeyword><dim> in </dim><accent>~/repo</accent><muted> (*.ts)</muted><toolOutput> limit 5</toolOutput>',
    );
    expect(rendered).toContain('Report');
    expect(rendered).toContain('Final');
  });

  test('keeps expanded usage summary after markdown output', () => {
    const registered: any[] = [];
    const details: AgentResult = {
      agent: 'scout',
      status: 'done',
      output: '# Report\n\nFinal **markdown** output.',
      tools: [],
      usage: {
        input: 11600,
        output: 7100,
        cacheRead: 132700,
        cacheWrite: 0,
        cost: 0.004,
        contextTokens: 19000,
        contextWindow: 1000000,
      },
      startedAt: 1,
      elapsedMs: 2,
      isError: false,
      exitCode: 0,
      stderr: '',
    };

    registerSubagentTool(
      { registerTool: (tool: unknown) => registered.push(tool) },
      { agents: [agent] },
    );

    const lines = registered[0]
      .renderResult({ content: [], details }, { expanded: true }, testTheme)
      .render(1000)
      .map((line: string) => line.trimEnd());

    expect(lines.at(-1)).toBe('1.9%/1m ↑11.6k ↓7.1k R132.7k $0.004');
    expect(lines.at(-2)).toBe('');
    expect(lines.findIndex((line: string) => line.includes('Final'))).toBeLessThan(
      lines.length - 2,
    );
  });

  test('wraps long paths instead of compacting them from the left', () => {
    const registered: any[] = [];
    const details: AgentResult = {
      agent: 'scout',
      status: 'done',
      output: 'ok',
      tools: [
        {
          id: 'read-long',
          name: 'read',
          args: {
            path: '~/dev/playground/pi-playground/.pi/npm/node_modules/pi-messenger/config/schema.ts',
            offset: 1,
            limit: 30,
          },
          status: 'done' as const,
        },
      ],
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0 },
      startedAt: 1,
      elapsedMs: 2,
      isError: false,
      exitCode: 0,
      stderr: '',
    };

    registerSubagentTool(
      { registerTool: (tool: unknown) => registered.push(tool) },
      { agents: [agent] },
    );

    const component = registered[0].renderResult(
      { content: [], details },
      { expanded: false },
      testTheme,
    );

    expect(component.render(140).join('\n')).toContain(
      'read ~/dev/playground/pi-playground/.pi/npm/node_modules/pi-messenger/config/schema.ts:1-30',
    );

    const narrow = component.render(64).join('\n');
    expect(narrow).toContain('read');
    expect(narrow).toContain('~/dev/playground/pi-playground/.pi/npm/node_modules/pi-messenger');
    expect(narrow).toContain('/config/schema.ts:1-30');
    expect(narrow).not.toContain('.../');
  });

  test('wraps very long file names without left compaction', () => {
    const registered: any[] = [];
    const details: AgentResult = {
      agent: 'scout',
      status: 'done',
      output: 'ok',
      tools: [
        {
          id: 'read-long-file',
          name: 'read',
          args: {
            path: '~/dev/playground/pi-playground/papers/(SIGGRAPH 2023) Learning Physics From Very Long Paper Title Final Version.md',
            offset: 1,
            limit: 20,
          },
          status: 'done' as const,
        },
      ],
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0 },
      startedAt: 1,
      elapsedMs: 2,
      isError: false,
      exitCode: 0,
      stderr: '',
    };

    registerSubagentTool(
      { registerTool: (tool: unknown) => registered.push(tool) },
      { agents: [agent] },
    );

    const rendered = registered[0]
      .renderResult({ content: [], details }, { expanded: false }, testTheme)
      .render(72)
      .join('\n');

    expect(rendered).toContain('read ~/dev/playground/pi-playground/papers/(SIGGRAPH 2023)');
    expect(rendered).toContain('Final Version.md:1-20');
    expect(rendered).not.toContain('read .../');
  });

  test('wraps collapsed tool log and hidden hint rows when width is narrow', () => {
    const registered: any[] = [];
    const details: AgentResult = {
      agent: 'scout',
      status: 'done',
      output:
        'Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu.\n\nSecond paragraph stays visible.',
      tools: [
        ...Array.from({ length: 24 }, (_, index) => ({
          id: `read-${index}`,
          name: 'read',
          args: { path: `archive/very-long-directory-name/file-${index}.md` },
          status: 'done' as const,
        })),
        {
          id: 'bash-long',
          name: 'bash',
          args: {
            command:
              'width-aware-single-line-tool-rows bun test tests/subagent-render.test.ts --filter long-command',
          },
          status: 'done' as const,
        },
      ],
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0 },
      startedAt: 1,
      elapsedMs: 2,
      isError: false,
      exitCode: 0,
      stderr: '',
    };

    registerSubagentTool(
      { registerTool: (tool: unknown) => registered.push(tool) },
      { agents: [agent] },
    );

    const lines = registered[0]
      .renderResult({ content: [], details }, { expanded: false }, testTheme)
      .render(36)
      .map((line: string) => line.trimEnd());

    const rendered = lines.join('\n');
    expect(rendered).toContain('earlier tool calls');
    expect(rendered).toContain('expand');

    expect(rendered).toContain('width-aware');
    expect(rendered).toContain('long-command');
    expect(rendered).not.toContain('.../');

    expect(lines.some((line: string) => line.includes('Alpha beta gamma'))).toBe(true);
    expect(lines.some((line: string) => line.includes('iota kappa lambda'))).toBe(true);
  });

  test('registers subagent and executes the requested agent task', async () => {
    const registered: any[] = [];
    const expected: AgentResult = {
      agent: 'scout',
      status: 'done',
      output: 'scouted',
      tools: [],
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0 },
      startedAt: 1,
      elapsedMs: 2,
      isError: false,
      exitCode: 0,
      stderr: '',
    };

    registerSubagentTool(
      { registerTool: (tool: unknown) => registered.push(tool) },
      {
        agents: [agent],
        env: {},
        run: async (options) => {
          expect(options.agent).toBe(agent);
          expect(options.task).toBe('List files');
          expect(options.cwd).toBe('/repo');
          expect(options.availableAgents).toEqual(['scout']);
          return expected;
        },
      },
    );

    expect(registered).toHaveLength(1);
    expect(registered[0].name).toBe('subagent');

    const result = await registered[0].execute(
      'call-1',
      { agent: 'scout', task: 'List files' },
      undefined,
      undefined,
      {
        cwd: '/repo',
      },
    );

    expect(result).toEqual({
      content: [{ type: 'text', text: 'scouted' }],
      details: expected,
      isError: false,
    });
  });

  test('passes only requested agent allowedAgents as child availableAgents', async () => {
    const registered: any[] = [];
    const worker: AgentConfig = {
      ...agent,
      name: 'worker',
      allowedAgents: ['scout'],
    };
    const writer: AgentConfig = { ...agent, name: 'writer' };

    registerSubagentTool(
      { registerTool: (tool: unknown) => registered.push(tool) },
      {
        agents: [agent, worker, writer],
        env: {},
        run: async (options) => {
          expect(options.agent).toBe(worker);
          expect(options.availableAgents).toEqual(['scout']);
          return {
            agent: 'worker',
            status: 'done',
            output: 'worked',
            tools: [],
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0 },
            startedAt: 1,
            elapsedMs: 2,
            isError: false,
            exitCode: 0,
            stderr: '',
          };
        },
      },
    );

    await registered[0].execute(
      'call-1',
      { agent: 'worker', task: 'Delegate' },
      undefined,
      undefined,
      { cwd: '/repo' },
    );
  });

  test('includes available subagents in promptGuidelines', () => {
    const registered: any[] = [];
    const reviewer: AgentConfig = { ...agent, name: 'reviewer' };

    registerSubagentTool(
      { registerTool: (tool: unknown) => registered.push(tool) },
      { agents: [agent, reviewer] },
    );

    expect(registered[0].promptGuidelines).toEqual(['Available subagents: reviewer, scout']);
  });

  test('omits promptGuidelines when no agents are available', () => {
    const registered: any[] = [];

    registerSubagentTool(
      { registerTool: (tool: unknown) => registered.push(tool) },
      { agents: [] },
    );

    expect(registered[0].promptGuidelines).toBeUndefined();
  });

  test('promptGuidelines respects PI_SUBAGENT_ALLOWED filtering', () => {
    const registered: any[] = [];
    const writer: AgentConfig = { ...agent, name: 'writer' };

    registerSubagentTool(
      { registerTool: (tool: unknown) => registered.push(tool) },
      {
        agents: [agent, writer],
        env: { PI_SUBAGENT_ALLOWED: 'scout' },
      },
    );

    expect(registered[0].promptGuidelines).toEqual(['Available subagents: scout']);
  });

  test('promptGuidelines is undefined when PI_SUBAGENT_ALLOWED filters out all agents', () => {
    const registered: any[] = [];

    registerSubagentTool(
      { registerTool: (tool: unknown) => registered.push(tool) },
      {
        agents: [agent],
        env: { PI_SUBAGENT_ALLOWED: 'nonexistent' },
      },
    );

    expect(registered[0].promptGuidelines).toBeUndefined();
  });
});
