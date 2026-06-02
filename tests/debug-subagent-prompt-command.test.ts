import { describe, expect, test } from 'bun:test';
import type { AgentConfig } from '../extensions/agent-loader.ts';
import {
  registerDebugSubagentPromptCommand,
  __testing,
  type PromptPreview,
} from '../extensions/debug-subagent-prompt-command.ts';

const agent: AgentConfig = {
  name: 'scout',
  tools: ['read', 'subagent'],
  thinking: 'low',
  systemPromptMode: 'append',
  allowedAgents: ['reviewer'],
  maxDepth: 10,
  prompt: 'Scout.',
  source: 'global',
  filePath: '/agents/scout.md',
};

function commandHarness() {
  const registered: any[] = [];
  const notifications: Array<{ message: string; level: string }> = [];
  const ctx = {
    cwd: '/repo',
    hasUI: true,
    ui: {
      notify: (message: string, level: string) => notifications.push({ message, level }),
    },
  } as any;

  return {
    registered,
    notifications,
    ctx,
    pi: { registerCommand: (_name: string, command: unknown) => registered.push(command) },
  };
}

describe('registerDebugSubagentPromptCommand', () => {
  test('reports usage when agent name is missing', async () => {
    const harness = commandHarness();

    registerDebugSubagentPromptCommand(harness.pi, { agents: [agent] });
    await harness.registered[0].handler('', harness.ctx);

    expect(harness.notifications).toEqual([
      {
        message: 'Usage: /debug-subagent-prompt <agentName>. Available agents: scout.',
        level: 'error',
      },
    ]);
  });

  test('filters available agents and completions through recursion env', async () => {
    const harness = commandHarness();
    const reviewer: AgentConfig = { ...agent, name: 'reviewer' };

    registerDebugSubagentPromptCommand(harness.pi, {
      agents: [agent, reviewer],
      env: { PI_SUBAGENT_ALLOWED: 'reviewer' },
    });

    expect(harness.registered[0].getArgumentCompletions('re')).toEqual([
      { value: 'reviewer', label: 'reviewer' },
    ]);

    await harness.registered[0].handler('scout', harness.ctx);
    expect(harness.notifications).toEqual([
      {
        message: 'Unknown agent: scout. Available agents: reviewer.',
        level: 'error',
      },
    ]);
  });

  test('builds prompt preview with metadata header and warnings', async () => {
    const harness = commandHarness();
    const previews: PromptPreview[] = [];

    registerDebugSubagentPromptCommand(harness.pi, {
      agents: [agent],
      buildPrompt: async (options) => {
        expect(options.agent.name).toBe('scout');
        expect(options.cwd).toBe('/repo');
        expect(options.availableAgents).toEqual(['scout']);
        return {
          prompt: 'Scout.\n\nAvailable subagents:\n- scout',
          missingSkills: ['caveman'],
          skippedSkillPackages: ['npm:missing'],
        };
      },
      openPreview: async (preview) => {
        previews.push(preview);
      },
    });

    await harness.registered[0].handler('scout', harness.ctx);

    expect(harness.notifications).toEqual([
      {
        message: '[pi-subagents] package not installed, skipping skills: npm:missing',
        level: 'info',
      },
      { message: '[pi-subagents] skill not found: caveman', level: 'info' },
    ]);
    expect(previews).toHaveLength(1);
    expect(previews[0].warnings).toEqual([
      'package not installed, skipping skills: npm:missing',
      'skill not found: caveman',
    ]);
    expect(previews[0].content).toContain('Sub-agent System Prompt Preview — scout');
    expect(previews[0].content).toContain(
      'append content only; pi default system prompt is not included',
    );
    expect(previews[0].content).toContain('Source: /agents/scout.md');
    expect(previews[0].content).toContain(
      'Warnings:\n- package not installed, skipping skills: npm:missing\n- skill not found: caveman',
    );
    expect(previews[0].content.endsWith('Scout.\n\nAvailable subagents:\n- scout')).toBe(true);
  });
});

describe('debug-subagent-prompt helpers', () => {
  test('parses first argument', () => {
    expect(__testing.firstArg(' scout extra ')).toBe('scout');
    expect(__testing.firstArg('')).toBeUndefined();
  });
});
