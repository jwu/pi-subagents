import {
  getMarkdownTheme,
  keyHint,
  type AgentToolUpdateCallback,
  type ExtensionAPI,
  type ExtensionContext,
  type ThemeColor,
} from '@earendil-works/pi-coding-agent';
import { Container, Markdown, Spacer, Text } from '@earendil-works/pi-tui';
import type { AgentConfig } from './agent-loader.ts';
import {
  availableSubagentsForAgent,
  type AgentProgress,
  type AgentResult,
  runSubagent,
} from './subagent-executor.ts';
import {
  contextUsageSeverity,
  formatSubagentCall,
  formatSubagentResultLines,
  formatUsage,
  type SubagentResultLine,
} from './subagent-render.ts';
import { numberArg, preview, shortenPath, stringArg } from './tool-args.ts';
import { allowedAgentNames, isPastMaxDepth, type RecursionEnv } from './env-utils.ts';

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
export interface RegisterSubagentToolOptions {
  agents: AgentConfig[];
  run?: typeof runSubagent;
  env?: RecursionEnv;
  /** Merged with per-call AbortSignal so process SIGTERM/SIGINT cascades to child processes. */
  processSignal?: AbortSignal;
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

type CollapsedTheme = {
  fg: (name: ThemeColor, text: string) => string;
  bold: (text: string) => string;
};

function styledPathArg(
  args: Record<string, unknown>,
  theme: CollapsedTheme,
  fallback?: string,
): string {
  const path = shortenPath(args.path ?? args.file_path) ?? fallback;
  return path ? theme.fg('accent', path) : theme.fg('toolOutput', '...');
}

function styledLineRange(args: Record<string, unknown>, theme: CollapsedTheme): string {
  if (args.offset === undefined && args.limit === undefined) return '';
  const startLine = numberArg(args, 'offset') ?? 1;
  const limit = numberArg(args, 'limit');
  const endLine = limit !== undefined ? startLine + limit - 1 : undefined;
  return theme.fg('warning', `:${startLine}${endLine !== undefined ? `-${endLine}` : ''}`);
}

function styledLimitSuffix(args: Record<string, unknown>, theme: CollapsedTheme): string {
  const limit = numberArg(args, 'limit');
  return limit !== undefined ? theme.fg('toolOutput', ` (limit ${limit})`) : '';
}

function styledToolTitle(
  name: string,
  args: Record<string, unknown>,
  theme: CollapsedTheme,
): string {
  switch (name) {
    case 'read':
      return `${theme.fg('toolTitle', theme.bold('read'))} ${styledPathArg(args, theme)}${styledLineRange(args, theme)}`;
    case 'bash': {
      const command = stringArg(args, 'command') ?? '';
      const timeout = numberArg(args, 'timeout');
      const timeoutSuffix =
        timeout !== undefined ? theme.fg('muted', ` (timeout ${timeout}s)`) : '';
      return `${theme.fg('toolTitle', theme.bold(`$ ${command || '...'}`))}${timeoutSuffix}`;
    }
    case 'edit':
      return `${theme.fg('toolTitle', theme.bold('edit'))} ${styledPathArg(args, theme)}`;
    case 'write':
      return `${theme.fg('toolTitle', theme.bold('write'))} ${styledPathArg(args, theme)}`;
    case 'find': {
      const pattern = stringArg(args, 'pattern') ?? '';
      return `${theme.fg('toolTitle', theme.bold('find'))} ${theme.fg('accent', pattern)}${theme.fg('toolOutput', ` in ${shortenPath(args.path) ?? '.'}`)}${styledLimitSuffix(args, theme)}`;
    }
    case 'grep': {
      const pattern = stringArg(args, 'pattern') ?? '';
      const glob = stringArg(args, 'glob');
      const limit = numberArg(args, 'limit');
      let text = `${theme.fg('toolTitle', theme.bold('grep'))} ${theme.fg('syntaxKeyword', `/${pattern}/`)}${theme.fg('dim', ' in ')}${theme.fg('accent', shortenPath(args.path) ?? '.')}`;
      if (glob) text += theme.fg('muted', ` (${glob})`);
      if (limit !== undefined) text += theme.fg('toolOutput', ` limit ${limit}`);
      return text;
    }
    case 'ls':
      return `${theme.fg('toolTitle', theme.bold('ls'))} ${styledPathArg(args, theme, '.')}${styledLimitSuffix(args, theme)}`;
    case 'webfetch': {
      const url = stringArg(args, 'url') ?? '';
      const mode = stringArg(args, 'mode');
      return `${theme.fg('toolTitle', theme.bold('webfetch'))} ${theme.fg('accent', url)}${mode ? theme.fg('toolOutput', ` (${mode})`) : ''}`;
    }
    case 'subagent': {
      const agent = stringArg(args, 'agent') ?? '';
      const task = stringArg(args, 'task');
      return `${theme.fg('toolTitle', theme.bold('subagent'))} ${theme.fg('accent', agent)}${task ? ` ${theme.fg('dim', JSON.stringify(preview(task, 60)))}` : ''}`.trimEnd();
    }
    default: {
      const values = Object.values(args).filter((value) => typeof value === 'string') as string[];
      return `${theme.fg('toolTitle', theme.bold(name))}${values.length > 0 ? ` ${theme.fg('dim', JSON.stringify(preview(values[0], 80)))}` : ''}`;
    }
  }
}

function styledCollapsedLine(
  line: SubagentResultLine,
  details: AgentResult | AgentProgress,
  theme: CollapsedTheme,
): string {
  if (line.kind === 'status')
    return theme.fg(details.status === 'error' ? 'error' : 'success', line.text);
  if (line.kind === 'hint') return theme.fg('dim', line.text);
  if (line.kind === 'tool' && line.tool) {
    const prefix = line.tool.status === 'running' ? theme.fg('warning', '▸') : ' ';
    return `${prefix} ${styledToolTitle(line.tool.name, line.tool.args, theme)}`;
  }
  if (line.kind === 'usage') return theme.fg(contextUsageSeverity(details.usage), line.text);
  return line.text;
}

function styledSubagentCall(
  args: SubagentParamsType,
  theme: CollapsedTheme,
  expanded: boolean,
): string {
  const title = `${theme.fg('toolTitle', theme.bold('subagent'))} ${theme.fg('accent', args.agent ?? '...')}`;
  if (expanded) return `${title}\n${theme.fg('dim', args.task ?? '...')}`;
  return `${title} ${theme.fg('dim', formatSubagentCall(args).replace(/^subagent \S+ /, ''))}`;
}

function renderResultLines(
  details: AgentResult | AgentProgress,
  theme: CollapsedTheme,
  options: {
    expanded: boolean;
    suppressOutput?: boolean;
    suppressUsage?: boolean;
    expandHint?: string;
  },
): Container {
  const container = new Container();
  for (const line of formatSubagentResultLines(details, options)) {
    if (line.kind === 'blank') {
      container.addChild(new Spacer(1));
      continue;
    }

    const text = styledCollapsedLine(line, details, theme);
    container.addChild(new Text(text, 0, 0));
  }
  return container;
}

function renderCollapsedResult(
  details: AgentResult | AgentProgress,
  theme: CollapsedTheme,
): Container {
  return renderResultLines(details, theme, {
    expanded: false,
    expandHint: keyHint('app.tools.expand', 'to expand'),
  });
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

  const availableSubagents = agents.map((agent) => agent.name);
  const agentNames = [...availableSubagents].sort().join(', ');
  const promptGuidelines =
    agentNames.length > 0 ? [`Available subagents: ${agentNames}`] : undefined;

  pi.registerTool({
    name: 'subagent',
    label: 'Subagent',
    description: 'Delegate a task to a named sub-agent running in an isolated pi process.',
    promptSnippet: 'Delegate isolated tasks with subagent({ agent, task, cwd? }).',
    promptGuidelines,
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

      // Merge per-call signal with process signal for cascading cancellation.
      // Without this, SIGTERM on this pi process leaves grandchild subagents running.
      const mergedSignal: AbortSignal | undefined = (() => {
        if (signal && options.processSignal) return AbortSignal.any([signal, options.processSignal]);
        return signal ?? options.processSignal;
      })();

      const result = await runner({
        agent,
        task: params.task,
        cwd: params.cwd ?? ctx.cwd,
        signal: mergedSignal,
        depth: Number(env.PI_SUBAGENT_DEPTH ?? '0') + 1,
        availableAgents: availableSubagentsForAgent(agent, availableSubagents),
        onProgress: (progress) => onUpdate?.(toProgressResult(progress)),
      });

      return toToolResult(result);
    },

    renderCall(args, theme, context) {
      const typedArgs = args as SubagentParamsType;
      return new Text(styledSubagentCall(typedArgs, theme, context.expanded), 0, 0);
    },

    renderResult(result, options, theme) {
      const details = result.details as AgentResult | AgentProgress | undefined;
      if (!details) {
        const first = result.content[0];
        return new Text(first?.type === 'text' ? first.text : '(no output)', 0, 0);
      }

      if (options.expanded) {
        const container = renderResultLines(details, theme, {
          expanded: true,
          suppressOutput: true,
          suppressUsage: true,
        });
        container.addChild(new Spacer(1));
        container.addChild(new Markdown(details.output || '(no output)', 0, 0, getMarkdownTheme()));
        container.addChild(new Spacer(1));
        container.addChild(
          new Text(theme.fg(contextUsageSeverity(details.usage), formatUsage(details)), 0, 0),
        );
        return container;
      }

      return renderCollapsedResult(details, theme);
    },
  });
}
