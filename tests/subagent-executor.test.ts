import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolvePiEntryPoint, runSubagent } from '../extensions/subagent-executor.ts';
import type { AgentConfig } from '../extensions/agent-loader.ts';

const baseAgent: AgentConfig = {
  name: 'scout',
  description: 'Scout',
  tools: ['read', 'grep'],
  model: 'anthropic/claude-haiku-4-5',
  thinking: 'low',
  systemPromptMode: 'replace',
  maxDepth: 3,
  prompt: 'You scout code.',
  source: 'global',
  filePath: '/agents/scout.md',
};

describe('resolvePiEntryPoint', () => {
  test('resolves the pi CLI entry point from the installed package', () => {
    const resolution = resolvePiEntryPoint();

    expect(resolution.command).toBe(process.execPath);
    expect(resolution.entryPoint.endsWith('/dist/cli.js')).toBe(true);
    expect(existsSync(resolution.entryPoint)).toBe(true);
  });
});

describe('runSubagent', () => {
  test('runs pi with isolated prompt, selected tools, model, and thinking level', async () => {
    const calls: Array<{ command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv }> =
      [];

    const result = await runSubagent({
      agent: baseAgent,
      task: 'List files',
      cwd: '/repo',
      tempRoot: '/tmp/pi-subagents-test',
      agentDir: '/root/.pi/agent',
      resolvePi: async () => ({ command: '/usr/local/bin/node', entryPoint: '/pi/dist/cli.js' }),
      fs: {
        makeTempDir: async () => '/tmp/pi-subagents-test/run-1',
        writeFile: async () => undefined,
        removeDir: async () => undefined,
      },
      runner: async (invocation, handlers) => {
        calls.push(invocation);
        handlers.stdout(
          JSON.stringify({
            type: 'message_end',
            message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
          }) + '\n',
        );
        return { exitCode: 0 };
      },
    });

    expect(result.output).toBe('done');
    expect(result.isError).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe('/usr/local/bin/node');
    expect(calls[0].args).toEqual([
      '/pi/dist/cli.js',
      '--mode',
      'json',
      '-p',
      '--no-skills',
      '--no-prompt-templates',
      '--no-context-files',
      '--model',
      'anthropic/claude-haiku-4-5',
      '--thinking',
      'low',
      '--tools',
      'read,grep',
      '--system-prompt',
      '/tmp/pi-subagents-test/run-1/system-prompt.md',
      '--session-dir',
      '/root/.pi/agent/sessions/--repo--/subagents',
      'Task: List files',
    ]);
    expect(calls[0].cwd).toBe('/repo');
    expect(calls[0].env.PI_SUBAGENT_DEPTH).toBe('1');
    expect(calls[0].env.PI_SUBAGENT_MAX_DEPTH).toBe('3');
  });

  test('truncates oversized output and writes the complete output to a readable temp file', async () => {
    const writes: Array<{ filePath: string; content: string }> = [];
    const output = `${'A'.repeat(20 * 1024)}${'B'.repeat(60 * 1024)}TAIL`;

    const result = await runSubagent({
      agent: baseAgent,
      task: 'Generate large report',
      cwd: '/repo',
      tempRoot: '/tmp/pi-subagents-test',
      outputArchiveDir: '/tmp/pi-subagents-output',
      agentDir: '/root/.pi/agent',
      resolvePi: async () => ({ command: '/usr/local/bin/node', entryPoint: '/pi/dist/cli.js' }),
      fs: {
        makeTempDir: async () => '/tmp/pi-subagents-test/run-large-output',
        writeFile: async (filePath, content) => {
          writes.push({ filePath, content });
        },
        removeDir: async () => undefined,
      },
      now: () => 1234,
      runner: async (_invocation, handlers) => {
        handlers.stdout(
          JSON.stringify({
            type: 'message_end',
            message: { role: 'assistant', content: [{ type: 'text', text: output }] },
          }) + '\n',
        );
        return { exitCode: 0 };
      },
    });

    expect(result.output).not.toContain('A'.repeat(1000));
    expect(result.output).toContain('B'.repeat(1000));
    expect(result.output).toContain('TAIL');
    expect(result.output).toContain('[Output truncated:');
    expect(result.output).toContain('/tmp/pi-subagents-output/scout-1234-output.md');
    expect(writes).toContainEqual({
      filePath: '/tmp/pi-subagents-output/scout-1234-output.md',
      content: output,
    });
  });

  test('aggregates usage and context window from assistant messages', async () => {
    const result = await runSubagent({
      agent: baseAgent,
      task: 'Report usage',
      cwd: '/repo',
      tempRoot: '/tmp/pi-subagents-test',
      resolvePi: async () => ({ command: '/usr/local/bin/node', entryPoint: '/pi/dist/cli.js' }),
      fs: {
        makeTempDir: async () => '/tmp/pi-subagents-test/run-usage',
        writeFile: async () => undefined,
        removeDir: async () => undefined,
      },
      runner: async (_invocation, handlers) => {
        handlers.stdout(
          JSON.stringify({
            type: 'message_end',
            message: {
              role: 'assistant',
              model: 'anthropic/claude-sonnet-4-6',
              usage: {
                input: 100,
                output: 20,
                cacheRead: 3,
                cacheWrite: 4,
                totalTokens: 70,
                contextWindow: 100,
                cost: { total: 0.1234 },
              },
              content: [{ type: 'text', text: 'usage reported' }],
            },
          }) + '\n',
        );
        return { exitCode: 0 };
      },
    });

    expect(result.model).toBe('anthropic/claude-sonnet-4-6');
    expect(result.usage).toEqual({
      input: 100,
      output: 20,
      cacheRead: 3,
      cacheWrite: 4,
      cost: 0.1234,
      contextTokens: 70,
      contextWindow: 100,
    });
  });

  test('attaches nested subagent progress to the launching tool from update events', async () => {
    const updates: any[] = [];
    const nested = {
      agent: 'researcher',
      status: 'running',
      output: 'researching',
      tools: [],
      usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0 },
      startedAt: 1,
      elapsedMs: 2,
    };

    await runSubagent({
      agent: baseAgent,
      task: 'Delegate',
      cwd: '/repo',
      tempRoot: '/tmp/pi-subagents-test',
      resolvePi: async () => ({ command: '/usr/local/bin/node', entryPoint: '/pi/dist/cli.js' }),
      fs: {
        makeTempDir: async () => '/tmp/pi-subagents-test/run-nested',
        writeFile: async () => undefined,
        removeDir: async () => undefined,
      },
      onProgress: (progress) => updates.push(progress),
      runner: async (_invocation, handlers) => {
        handlers.stdout(
          JSON.stringify({
            type: 'tool_execution_start',
            toolCallId: 'sub-1',
            toolName: 'subagent',
            args: { agent: 'researcher' },
          }) + '\n',
        );
        handlers.stdout(
          JSON.stringify({
            type: 'tool_execution_update',
            toolCallId: 'sub-1',
            toolName: 'subagent',
            partialResult: { details: nested },
          }) + '\n',
        );
        handlers.stdout(
          JSON.stringify({
            type: 'message_end',
            message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
          }) + '\n',
        );
        return { exitCode: 0 };
      },
    });

    expect(updates.some((update) => update.tools[0]?.nested?.agent === 'researcher')).toBe(true);
  });

  test('skips non-json stdout lines and returns an error result for non-zero exit', async () => {
    const result = await runSubagent({
      agent: baseAgent,
      task: 'Fail politely',
      cwd: '/repo',
      tempRoot: '/tmp/pi-subagents-test',
      resolvePi: async () => ({ command: '/usr/local/bin/node', entryPoint: '/pi/dist/cli.js' }),
      fs: {
        makeTempDir: async () => '/tmp/pi-subagents-test/run-nonzero',
        writeFile: async () => undefined,
        removeDir: async () => undefined,
      },
      runner: async (_invocation, handlers) => {
        handlers.stdout('not json\n');
        handlers.stderr('boom');
        return { exitCode: 2 };
      },
    });

    expect(result.isError).toBe(true);
    expect(result.exitCode).toBe(2);
    expect(result.output).toBe('boom');
  });

  test('cleans up the temp directory and returns a friendly error when spawn fails', async () => {
    const removed: string[] = [];

    const result = await runSubagent({
      agent: baseAgent,
      task: 'Crash',
      cwd: '/repo',
      tempRoot: '/tmp/pi-subagents-test',
      resolvePi: async () => ({ command: '/missing/node', entryPoint: '/pi/dist/cli.js' }),
      fs: {
        makeTempDir: async () => '/tmp/pi-subagents-test/run-crash',
        writeFile: async () => undefined,
        removeDir: async (dir) => {
          removed.push(dir);
        },
      },
      runner: async () => {
        throw new Error('spawn ENOENT');
      },
    });

    expect(result.isError).toBe(true);
    expect(result.output).toBe('spawn ENOENT');
    expect(removed).toEqual(['/tmp/pi-subagents-test/run-crash']);
  });

  test('does not pass allowedAgents to agents that cannot call subagent', async () => {
    const calls: Array<{ env: NodeJS.ProcessEnv }> = [];

    await runSubagent({
      agent: { ...baseAgent, allowedAgents: ['scout'] },
      task: 'List files',
      cwd: '/repo',
      tempRoot: '/tmp/pi-subagents-test',
      agentDir: '/root/.pi/agent',
      resolvePi: async () => ({ command: '/usr/local/bin/node', entryPoint: '/pi/dist/cli.js' }),
      fs: {
        makeTempDir: async () => '/tmp/pi-subagents-test/run-no-allowed',
        writeFile: async () => undefined,
        removeDir: async () => undefined,
      },
      runner: async (invocation, handlers) => {
        calls.push({ env: invocation.env });
        handlers.stdout(
          JSON.stringify({
            type: 'message_end',
            message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
          }) + '\n',
        );
        return { exitCode: 0 };
      },
    });

    expect(calls[0].env.PI_SUBAGENT_ALLOWED).toBeUndefined();
  });

  test('uses append prompt mode, writes long tasks to a temp file, and cleans up', async () => {
    const writes: Array<{ filePath: string; content: string }> = [];
    const removed: string[] = [];
    const calls: Array<{ args: string[] }> = [];
    const longTask = 'x'.repeat(8001);

    const result = await runSubagent({
      agent: {
        ...baseAgent,
        tools: ['read', 'subagent'],
        systemPromptMode: 'append',
        allowedAgents: ['scout', 'researcher'],
      },
      task: longTask,
      cwd: '/repo',
      tempRoot: '/tmp/pi-subagents-test',
      agentDir: '/root/.pi/agent',
      resolvePi: async () => ({ command: '/usr/local/bin/node', entryPoint: '/pi/dist/cli.js' }),
      fs: {
        makeTempDir: async () => '/tmp/pi-subagents-test/run-2',
        writeFile: async (filePath, content) => {
          writes.push({ filePath, content });
        },
        removeDir: async (dir) => {
          removed.push(dir);
        },
      },
      runner: async (invocation, handlers) => {
        calls.push({ args: invocation.args });
        expect(invocation.env.PI_SUBAGENT_ALLOWED).toBe('scout,researcher');
        handlers.stdout(
          JSON.stringify({
            type: 'message_end',
            message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
          }) + '\n',
        );
        return { exitCode: 0 };
      },
    });

    expect(result.output).toBe('ok');
    expect(writes).toEqual([
      { filePath: '/tmp/pi-subagents-test/run-2/system-prompt.md', content: 'You scout code.' },
      { filePath: '/tmp/pi-subagents-test/run-2/task.md', content: longTask },
    ]);
    expect(calls[0].args).toContain('--append-system-prompt');
    expect(calls[0].args).toContain('Task: @/tmp/pi-subagents-test/run-2/task.md');
    expect(removed).toEqual(['/tmp/pi-subagents-test/run-2']);
  });
});
