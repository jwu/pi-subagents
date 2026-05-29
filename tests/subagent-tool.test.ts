import { describe, expect, test } from 'bun:test';
import { registerSubagentTool } from '../extensions/subagent-tool.ts';
import type { AgentConfig } from '../extensions/agent-loader.ts';
import type { AgentResult } from '../extensions/subagent-executor.ts';

const agent: AgentConfig = {
  name: 'scout',
  tools: ['read'],
  thinking: 'off',
  systemPromptMode: 'replace',
  maxDepth: 10,
  prompt: 'Scout.',
  source: 'global',
  filePath: '/agents/scout.md',
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
});
