import { describe, expect, test } from 'bun:test';
import { loadAgentDefinitions } from '../extensions/agent-loader.ts';

describe('loadAgentDefinitions', () => {
  test('discovers a valid markdown agent with frontmatter', async () => {
    const files = new Map<string, string>([
      [
        '/home/me/.pi/agent/agents/scout.md',
        `---
name: scout
description: Fast codebase scout
tools: read, grep, find, ls
model: anthropic/claude-haiku-4-5
thinking: low
systemPrompt: append
allowedAgents: scout, researcher
maxDepth: 2
---
You inspect code quickly.
`,
      ],
    ]);

    const result = await loadAgentDefinitions({
      globalDir: '/home/me/.pi/agent/agents',
      projectDir: '/repo/.pi/agents',
      fs: {
        listFiles: async (dir) =>
          [...files.keys()].filter((filePath) => filePath.startsWith(`${dir}/`)),
        readFile: async (filePath) => files.get(filePath) ?? '',
      },
    });

    expect(result.warnings).toEqual([]);
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]).toMatchObject({
      name: 'scout',
      description: 'Fast codebase scout',
      tools: ['read', 'grep', 'find', 'ls'],
      model: 'anthropic/claude-haiku-4-5',
      thinking: 'low',
      systemPromptMode: 'append',
      allowedAgents: ['scout', 'researcher'],
      maxDepth: 2,
      debug: false,
      prompt: 'You inspect code quickly.\n',
      source: 'global',
      filePath: '/home/me/.pi/agent/agents/scout.md',
    });
  });

  test('applies defaults and skips malformed agent definitions with warnings', async () => {
    const files = new Map<string, string>([
      ['/global/minimal.md', '---\nname: minimal\n---\nMinimal prompt.\n'],
      ['/global/broken.md', '---\nname broken\n---\nBroken prompt.\n'],
      ['/global/readme.txt', 'not an agent'],
    ]);

    const result = await loadAgentDefinitions({
      globalDir: '/global',
      projectDir: '/project',
      fs: {
        listFiles: async (dir) =>
          [...files.keys()].filter((filePath) => filePath.startsWith(`${dir}/`)),
        readFile: async (filePath) => files.get(filePath) ?? '',
      },
    });

    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]).toMatchObject({
      name: 'minimal',
      tools: [],
      thinking: 'off',
      systemPromptMode: 'append',
      maxDepth: 10,
      debug: false,
    });
    expect(result.warnings).toEqual([
      { filePath: '/global/broken.md', message: 'invalid frontmatter line: name broken' },
    ]);
  });

  test('skips definitions missing required name and preserves explicit extended thinking levels', async () => {
    const files = new Map<string, string>([
      ['/global/noname.md', '---\ndescription: Missing name\n---\nNo name.\n'],
      [
        '/global/minimal-thinker.md',
        '---\nname: minimal-thinker\nthinking: minimal\n---\nThink a little.\n',
      ],
      [
        '/global/xhigh-thinker.md',
        '---\nname: xhigh-thinker\nthinking: xhigh\n---\nThink deeply.\n',
      ],
    ]);

    const result = await loadAgentDefinitions({
      globalDir: '/global',
      projectDir: '/project',
      fs: {
        listFiles: async (dir) =>
          [...files.keys()].filter((filePath) => filePath.startsWith(`${dir}/`)).sort(),
        readFile: async (filePath) => files.get(filePath) ?? '',
      },
    });

    expect(result.agents).toHaveLength(2);
    expect(result.agents.map((agent) => ({ name: agent.name, thinking: agent.thinking }))).toEqual([
      { name: 'minimal-thinker', thinking: 'minimal' },
      { name: 'xhigh-thinker', thinking: 'xhigh' },
    ]);
    expect(result.warnings).toEqual([
      { filePath: '/global/noname.md', message: 'missing required field: name' },
    ]);
  });

  test('parses replace-all system prompt mode', async () => {
    const files = new Map<string, string>([
      ['/project/scout.md', '---\nname: scout\nsystemPrompt: replace-all\n---\nScout.\n'],
    ]);

    const result = await loadAgentDefinitions({
      globalDir: '/global',
      projectDir: '/project',
      fs: {
        listFiles: async (dir) =>
          [...files.keys()].filter((filePath) => filePath.startsWith(`${dir}/`)),
        readFile: async (filePath) => files.get(filePath) ?? '',
      },
    });

    expect(result.warnings).toEqual([]);
    expect(result.agents[0].systemPromptMode).toBe('replace-all');
  });

  test('parses debug field from frontmatter', async () => {
    const files = new Map<string, string>([
      ['/project/debugger.md', '---\nname: debugger\ndebug: true\n---\nDebug prompt.\n'],
    ]);

    const result = await loadAgentDefinitions({
      globalDir: '/global',
      projectDir: '/project',
      fs: {
        listFiles: async (dir) =>
          [...files.keys()].filter((filePath) => filePath.startsWith(`${dir}/`)),
        readFile: async (filePath) => files.get(filePath) ?? '',
      },
    });

    expect(result.agents[0].debug).toBe(true);
  });

  test('rejects invalid debug frontmatter values', async () => {
    const files = new Map<string, string>([
      ['/global/invalid-debug.md', '---\nname: invalid-debug\ndebug: yes\n---\nInvalid.\n'],
    ]);

    const result = await loadAgentDefinitions({
      globalDir: '/global',
      projectDir: '/project',
      fs: {
        listFiles: async (dir) =>
          [...files.keys()].filter((filePath) => filePath.startsWith(`${dir}/`)),
        readFile: async (filePath) => files.get(filePath) ?? '',
      },
    });

    expect(result.agents).toEqual([]);
    expect(result.warnings).toEqual([
      { filePath: '/global/invalid-debug.md', message: 'invalid debug: yes' },
    ]);
  });

  test('parses skills field from frontmatter', async () => {
    const files = new Map<string, string>([
      [
        '/project/coder.md',
        '---\nname: coder\ndescription: Codes with style\nskills: tdd, caveman\n---\nWrite code.\n',
      ],
    ]);

    const result = await loadAgentDefinitions({
      globalDir: '/global',
      projectDir: '/project',
      fs: {
        listFiles: async (dir) =>
          [...files.keys()].filter((filePath) => filePath.startsWith(`${dir}/`)),
        readFile: async (filePath) => files.get(filePath) ?? '',
      },
    });

    expect(result.agents[0].skills).toEqual(['tdd', 'caveman']);
  });

  test('skills field is undefined when not declared in frontmatter', async () => {
    const files = new Map<string, string>([
      ['/global/minimal.md', '---\nname: minimal\n---\nMinimal.\n'],
    ]);

    const result = await loadAgentDefinitions({
      globalDir: '/global',
      projectDir: '/project',
      fs: {
        listFiles: async (dir) =>
          [...files.keys()].filter((filePath) => filePath.startsWith(`${dir}/`)),
        readFile: async (filePath) => files.get(filePath) ?? '',
      },
    });

    expect(result.agents[0].skills).toBeUndefined();
  });

  test('empty skills frontmatter value results in undefined', async () => {
    const files = new Map<string, string>([
      ['/global/empty.md', '---\nname: empty\nskills:\n---\nEmpty skills.\n'],
    ]);

    const result = await loadAgentDefinitions({
      globalDir: '/global',
      projectDir: '/project',
      fs: {
        listFiles: async (dir) =>
          [...files.keys()].filter((filePath) => filePath.startsWith(`${dir}/`)),
        readFile: async (filePath) => files.get(filePath) ?? '',
      },
    });

    expect(result.agents[0].skills).toBeUndefined();
  });

  test('does not parse skill (singular) field', async () => {
    const files = new Map<string, string>([
      ['/global/singular.md', '---\nname: singular\nskill: tdd\n---\nSingular skill.\n'],
    ]);

    const result = await loadAgentDefinitions({
      globalDir: '/global',
      projectDir: '/project',
      fs: {
        listFiles: async (dir) =>
          [...files.keys()].filter((filePath) => filePath.startsWith(`${dir}/`)),
        readFile: async (filePath) => files.get(filePath) ?? '',
      },
    });

    expect(result.agents[0].skills).toBeUndefined();
  });

  test('project-local agents override global agents while first duplicate in one directory wins', async () => {
    const files = new Map<string, string>([
      ['/global/scout-a.md', '---\nname: scout\ndescription: global first\n---\nA\n'],
      ['/global/scout-b.md', '---\nname: scout\ndescription: global second\n---\nB\n'],
      ['/project/scout.md', '---\nname: scout\ndescription: project\n---\nP\n'],
    ]);

    const result = await loadAgentDefinitions({
      globalDir: '/global',
      projectDir: '/project',
      fs: {
        listFiles: async (dir) =>
          [...files.keys()].filter((filePath) => filePath.startsWith(`${dir}/`)).sort(),
        readFile: async (filePath) => files.get(filePath) ?? '',
      },
    });

    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]).toMatchObject({
      name: 'scout',
      description: 'project',
      prompt: 'P\n',
      source: 'project',
    });
  });
});
