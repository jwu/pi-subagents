import {
  getMarkdownTheme,
  type AgentToolUpdateCallback,
  type ExtensionAPI,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { Container, Markdown, Spacer, Text } from '@earendil-works/pi-tui';
import type { AgentConfig } from './agent-loader.ts';
import { type AgentProgress, type AgentResult, runSubagent } from './subagent-executor.ts';
import {
  contextUsageSeverity,
  formatSubagentCall,
  formatSubagentResultText,
} from './subagent-render.ts';

const SubagentParams = {
  type: 'object',
  properties: {
    agent: { type: 'string', description: 'Name of the agent to invoke' },
    task: { type: 'string', description: 'Task to delegate to the agent' },
    cwd: { type: 'string', description: 'Working directory for the agent process' },
  },
  required: ['agent', 'task'],
  additionalProperties: false,
} as any;

type SubagentParamsType = {
  agent: string;
  task: string;
  cwd?: string;
};

type RegisterablePi = Pick<ExtensionAPI, 'registerTool'>;
type RecursionEnv = Partial<
  Record<'PI_SUBAGENT_ALLOWED' | 'PI_SUBAGENT_DEPTH' | 'PI_SUBAGENT_MAX_DEPTH', string>
>;

export interface RegisterSubagentToolOptions {
  agents: AgentConfig[];
  run?: typeof runSubagent;
  env?: RecursionEnv;
}

function availableAgentsText(agents: AgentConfig[]): string {
  return (
    agents
      .map((agent) => agent.name)
      .sort()
      .join(', ') || 'none'
  );
}

function toToolResult(result: AgentResult) {
  return {
    content: [{ type: 'text' as const, text: result.output || '(no output)' }],
    details: result,
    isError: result.isError,
  };
}

function toProgressResult(progress: AgentProgress) {
  return {
    content: [{ type: 'text' as const, text: progress.output || '(running...)' }],
    details: progress,
  };
}

function parseEnvNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function allowedAgentNames(env: RecursionEnv): Set<string> | undefined {
  const raw = env?.PI_SUBAGENT_ALLOWED;
  if (!raw) return undefined;
  return new Set(
    raw
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  );
}

function isPastMaxDepth(env: RecursionEnv): boolean {
  const depth = parseEnvNumber(env?.PI_SUBAGENT_DEPTH);
  const maxDepth = parseEnvNumber(env?.PI_SUBAGENT_MAX_DEPTH);
  return depth !== undefined && maxDepth !== undefined && depth > maxDepth;
}

export function registerSubagentTool(
  pi: RegisterablePi,
  options: RegisterSubagentToolOptions,
): void {
  const env: RecursionEnv = options.env ?? process.env;
  if (isPastMaxDepth(env)) return;

  const allowed = allowedAgentNames(env);
  const agents = allowed
    ? options.agents.filter((candidate) => allowed.has(candidate.name))
    : options.agents;
  const runner = options.run ?? runSubagent;

  pi.registerTool({
    name: 'subagent',
    label: 'Subagent',
    description: 'Delegate a task to a named sub-agent running in an isolated pi process.',
    promptSnippet: 'Delegate isolated tasks with subagent({ agent, task, cwd? }).',
    parameters: SubagentParams,

    async execute(
      _toolCallId: string,
      params: SubagentParamsType,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<AgentProgress> | undefined,
      ctx: ExtensionContext,
    ) {
      const agent = agents.find((candidate) => candidate.name === params.agent);
      if (!agent) {
        throw new Error(
          `Unknown agent: ${params.agent}. Available agents: ${availableAgentsText(agents)}.`,
        );
      }

      const result = await runner({
        agent,
        task: params.task,
        cwd: params.cwd ?? ctx.cwd,
        signal,
        depth: Number(env.PI_SUBAGENT_DEPTH ?? '0') + 1,
        onProgress: (progress) => onUpdate?.(toProgressResult(progress)),
      });

      return toToolResult(result);
    },

    renderCall(args, theme, context) {
      const typedArgs = args as SubagentParamsType;
      if (context.expanded) {
        return new Text(formatSubagentCall(typedArgs, { expanded: true }), 0, 0);
      }
      return new Text(
        `${theme.fg('toolTitle', theme.bold('subagent'))} ${theme.fg(
          'accent',
          typedArgs.agent ?? '...',
        )} ${theme.fg('dim', formatSubagentCall(typedArgs).replace(/^subagent \S+ /, ''))}`,
        0,
        0,
      );
    },

    renderResult(result, options, theme) {
      const details = result.details as AgentResult | AgentProgress | undefined;
      if (!details) {
        const first = result.content[0];
        return new Text(first?.type === 'text' ? first.text : '(no output)', 0, 0);
      }

      if (options.expanded) {
        const container = new Container();
        container.addChild(new Text(formatSubagentResultText(details, { expanded: false }), 0, 0));
        container.addChild(new Spacer(1));
        container.addChild(new Markdown(details.output || '(no output)', 0, 0, getMarkdownTheme()));
        return container;
      }

      const text = formatSubagentResultText(details, { expanded: false })
        .split('\n')
        .map((line, index) => {
          if (index === 0) return theme.fg(details.status === 'error' ? 'error' : 'success', line);
          if (line.startsWith('▸')) return theme.fg('warning', line);
          if (line.startsWith('↑')) return theme.fg(contextUsageSeverity(details.usage), line);
          return line;
        })
        .join('\n');
      return new Text(text, 0, 0);
    },
  });
}
