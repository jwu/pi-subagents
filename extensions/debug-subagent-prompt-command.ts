import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import type { AgentConfig } from './agent-loader.ts';
import { allowedAgentNames, isPastMaxDepth, type RecursionEnv } from './env-utils.ts';
import {
  buildSubagentSystemPrompt,
  type BuildSubagentSystemPromptResult,
} from './subagent-executor.ts';

export interface PromptPreview {
  agent: AgentConfig;
  content: string;
  prompt: string;
  warnings: string[];
}

export interface RegisterDebugSubagentPromptCommandOptions {
  agents: AgentConfig[];
  env?: RecursionEnv;
  agentDir?: string;
  buildPrompt?: typeof buildSubagentSystemPrompt;
  openPreview?: (preview: PromptPreview, ctx: ExtensionCommandContext) => Promise<void>;
}

type RegisterablePi = Pick<ExtensionAPI, 'registerCommand'>;

function availableAgents(agents: AgentConfig[], env: RecursionEnv): AgentConfig[] {
  if (isPastMaxDepth(env)) return [];
  const allowed = allowedAgentNames(env);
  return allowed ? agents.filter((candidate) => allowed.has(candidate.name)) : agents;
}

function availableAgentsText(agents: AgentConfig[]): string {
  return (
    agents
      .map((agent) => agent.name)
      .sort()
      .join(', ') || 'none'
  );
}

function firstArg(args: string): string | undefined {
  return args.trim().split(/\s+/).filter(Boolean)[0];
}

function writeTerminalControl(sequence: string): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write(sequence);
}

function getPiTerminalTitle(ctx: ExtensionCommandContext): string {
  return `π - ${path.basename(ctx.cwd)}`;
}

function formatHeader(agent: AgentConfig, prompt: string, warnings: string[]): string {
  const lines = prompt.split('\n').length;
  const modeNote =
    agent.systemPromptMode === 'append'
      ? 'append content only; pi default system prompt is not included'
      : 'replace content';
  const header = [
    `Sub-agent System Prompt Preview — ${agent.name}`,
    `${lines} lines, ${prompt.length} chars (${modeNote}, read-only)`,
    `Source: ${agent.filePath}`,
    `Mode: ${agent.systemPromptMode}`,
    `Tools: ${agent.tools.join(', ') || 'none'}`,
    `Model: ${agent.model ?? "parent's model"}`,
    `Thinking: ${agent.thinking}`,
  ];

  if (warnings.length > 0) {
    header.push('', 'Warnings:', ...warnings.map((warning) => `- ${warning}`));
  }

  return `${header.join('\n')}\n\n---\n\n`;
}

export async function openPromptInExternalEditor(
  preview: PromptPreview,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const editorCmd = process.env.VISUAL || process.env.EDITOR;
  if (!editorCmd) {
    ctx.ui.notify('No external editor configured ($VISUAL or $EDITOR not set)', 'error');
    return;
  }

  const tmpFile = path.join(
    os.tmpdir(),
    `pi-subagent-prompt-${preview.agent.name}-${Date.now()}.md`,
  );
  fs.writeFileSync(tmpFile, preview.content, 'utf-8');

  try {
    if (!ctx.hasUI) {
      ctx.ui.notify('debug-subagent-prompt requires interactive mode', 'error');
      return;
    }

    await ctx.ui.custom<void>((tui, _theme, _keybindings, done) => {
      const component = {
        render: () => ['Opening sub-agent system prompt in external editor...'],
        invalidate: () => {},
      };

      setImmediate(async () => {
        try {
          writeTerminalControl('\x1b[22;0t');
          tui.stop();

          const [editor, ...editorArgs] = editorCmd.split(' ');
          await new Promise<void>((resolve) => {
            const child = spawn(editor, [...editorArgs, tmpFile], {
              stdio: 'inherit',
              shell: process.platform === 'win32',
            });
            child.on('error', () => resolve());
            child.on('close', () => resolve());
          });
        } finally {
          writeTerminalControl('\x1b[23;0t');
          ctx.ui.setTitle(getPiTerminalTitle(ctx));
          tui.start();
          done();
          tui.requestRender(true);
        }
      });

      return component;
    });
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore cleanup errors
    }
  }
}

export function registerDebugSubagentPromptCommand(
  pi: RegisterablePi,
  options: RegisterDebugSubagentPromptCommandOptions,
): void {
  const env = options.env ?? process.env;
  const agents = availableAgents(options.agents, env);
  const agentNames = agents.map((agent) => agent.name).sort();
  const buildPrompt = options.buildPrompt ?? buildSubagentSystemPrompt;
  const openPreview = options.openPreview ?? openPromptInExternalEditor;

  pi.registerCommand('debug-subagent-prompt', {
    description: 'Preview a generated sub-agent system prompt in external editor',
    getArgumentCompletions: (prefix: string) => {
      const completions = agentNames
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({ value: name, label: name }));
      return completions.length > 0 ? completions : null;
    },
    handler: async (args, ctx) => {
      const agentName = firstArg(args);
      if (!agentName) {
        ctx.ui.notify(
          `Usage: /debug-subagent-prompt <agentName>. Available agents: ${availableAgentsText(agents)}.`,
          'error',
        );
        return;
      }

      const agent = agents.find((candidate) => candidate.name === agentName);
      if (!agent) {
        ctx.ui.notify(
          `Unknown agent: ${agentName}. Available agents: ${availableAgentsText(agents)}.`,
          'error',
        );
        return;
      }

      const result: BuildSubagentSystemPromptResult = await buildPrompt({
        agent,
        cwd: ctx.cwd,
        agentDir: options.agentDir,
      });
      const warnings = [
        ...result.skippedSkillPackages.map(
          (source) => `package not installed, skipping skills: ${source}`,
        ),
        ...result.missingSkills.map((name) => `skill not found: ${name}`),
      ];
      for (const warning of warnings) {
        ctx.ui.notify(`[pi-subagents] ${warning}`, 'info');
      }

      const content = `${formatHeader(agent, result.prompt, warnings)}${result.prompt}`;
      await openPreview({ agent, content, prompt: result.prompt, warnings }, ctx);
    },
  });
}

export const __testing = {
  availableAgents,
  firstArg,
  formatHeader,
  getPiTerminalTitle,
  writeTerminalControl,
};
