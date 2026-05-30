import { homedir } from 'node:os';
import type { AgentProgress } from './subagent-executor.ts';

export interface SubagentCallArgs {
  agent?: string;
  task?: string;
}

export interface RenderTextOptions {
  expanded: boolean;
  suppressOutput?: boolean;
  expandHint?: string;
}

export type SubagentResultLineKind = 'status' | 'tool' | 'hint' | 'usage' | 'output' | 'blank';

export interface SubagentResultLine {
  text: string;
  kind: SubagentResultLineKind;
  singleLine: boolean;
  tool?: {
    name: string;
    args: Record<string, unknown>;
    status: 'running' | 'done' | 'error';
  };
}

const TOOL_LOG_LIMIT = 20;

export type ContextUsageSeverity = 'dim' | 'warning' | 'error';

export function contextUsageSeverity(usage: {
  contextTokens?: number;
  contextWindow?: number;
}): ContextUsageSeverity {
  if (!usage.contextWindow || usage.contextWindow <= 0) return 'dim';
  const percent = (usage.contextTokens ?? 0) / usage.contextWindow;
  if (percent >= 0.9) return 'error';
  if (percent >= 0.7) return 'warning';
  return 'dim';
}

function preview(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function elapsedSeconds(ms: number): number {
  return Math.round(ms / 1000);
}

function stripCodeBlocks(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, '').trim();
}

function summaryText(markdown: string): string {
  return stripCodeBlocks(markdown)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20)
    .join('\n');
}

function formatTokens(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}m`;
  if (Math.abs(value) >= 1_000) return `${Number((value / 1_000).toFixed(1))}k`;
  return String(value);
}

function formatUsage(progress: AgentProgress): string {
  const usage = progress.usage;
  const parts: string[] = [];

  if (usage.contextWindow && usage.contextWindow > 0) {
    const percent = ((usage.contextTokens / usage.contextWindow) * 100).toFixed(1);
    parts.push(`${percent}%/${formatTokens(usage.contextWindow)}`);
  }

  parts.push(`↑${formatTokens(usage.input)}`);
  parts.push(`↓${formatTokens(usage.output)}`);
  parts.push(`R${formatTokens(usage.cacheRead)}`);
  if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
  parts.push(`$${usage.cost.toFixed(3)}`);

  return parts.join(' ');
}

function indent(text: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function shortenPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const home = homedir();
  return value.startsWith(`${home}/`) ? `~/${value.slice(home.length + 1)}` : value;
}

function quote(value: string | undefined): string {
  return value ? JSON.stringify(value) : '';
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
}

function numberArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === 'number' ? value : undefined;
}

function pathArg(args: Record<string, unknown>, fallback?: string): string {
  return shortenPath(args.path ?? args.file_path) ?? fallback ?? '...';
}

function lineRange(args: Record<string, unknown>): string {
  if (args.offset === undefined && args.limit === undefined) return '';
  const startLine = numberArg(args, 'offset') ?? 1;
  const limit = numberArg(args, 'limit');
  const endLine = limit !== undefined ? startLine + limit - 1 : undefined;
  return `:${startLine}${endLine !== undefined ? `-${endLine}` : ''}`;
}

function limitSuffix(args: Record<string, unknown>): string {
  const limit = numberArg(args, 'limit');
  return limit !== undefined ? ` (limit ${limit})` : '';
}

function formatToolTitle(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'read':
      return `read ${pathArg(args)}${lineRange(args)}`;
    case 'bash': {
      const command = stringArg(args, 'command') ?? '';
      const timeout = numberArg(args, 'timeout');
      return `$ ${command}${timeout !== undefined ? ` (timeout ${timeout}s)` : ''}`;
    }
    case 'edit':
      return `edit ${pathArg(args)}`;
    case 'write':
      return `write ${pathArg(args)}`;
    case 'find': {
      const pattern = stringArg(args, 'pattern') ?? '';
      return `find ${pattern} in ${pathArg(args, '.')}${limitSuffix(args)}`;
    }
    case 'grep': {
      const pattern = stringArg(args, 'pattern') ?? '';
      const glob = stringArg(args, 'glob');
      const globSuffix = glob ? ` (${glob})` : '';
      const limit = numberArg(args, 'limit');
      const limitText = limit !== undefined ? ` limit ${limit}` : '';
      return `grep /${pattern}/ in ${pathArg(args, '.')}${globSuffix}${limitText}`;
    }
    case 'ls':
      return `ls ${pathArg(args, '.')}${limitSuffix(args)}`;
    case 'webfetch': {
      const url = stringArg(args, 'url') ?? '';
      const mode = stringArg(args, 'mode');
      return `webfetch ${url}${mode ? ` (${mode})` : ''}`.trimEnd();
    }
    case 'subagent': {
      const agent = stringArg(args, 'agent');
      const task = stringArg(args, 'task');
      return `${name} ${agent ?? ''}${task ? ` ${quote(preview(task, 60))}` : ''}`.trimEnd();
    }
    default: {
      const values = Object.values(args).filter((value) => typeof value === 'string') as string[];
      return `${name}${values.length > 0 ? ` ${quote(preview(values[0], 80))}` : ''}`;
    }
  }
}

function formatToolLineItems(
  progress: AgentProgress,
  options: RenderTextOptions,
): SubagentResultLine[] {
  const lines: SubagentResultLine[] = [];
  const hiddenCount = options.expanded ? 0 : Math.max(0, progress.tools.length - TOOL_LOG_LIMIT);
  const visibleTools = progress.tools.slice(hiddenCount);

  if (hiddenCount > 0) {
    const expandHint = options.expandHint ?? 'to expand';
    lines.push({
      text: `  ... (${hiddenCount} earlier tool calls, ${expandHint})`,
      kind: 'hint',
      singleLine: true,
    });
  }

  for (const tool of visibleTools) {
    lines.push({
      text: `${tool.status === 'running' ? '▸' : ' '} ${formatToolTitle(tool.name, tool.args)}`,
      kind: 'tool',
      singleLine: true,
      tool: { name: tool.name, args: tool.args, status: tool.status },
    });
    if ((options.expanded || progress.status === 'running') && tool.nested) {
      for (const line of formatSubagentResultLines(tool.nested, {
        expanded: false,
        suppressOutput: true,
      })) {
        lines.push({ ...line, text: indent(line.text, 2) });
      }
    }
  }
  return lines;
}

export function formatSubagentCall(
  args: SubagentCallArgs,
  options: Partial<RenderTextOptions> = {},
): string {
  if (options.expanded) return `subagent ${args.agent ?? '...'}\n${args.task ?? '...'}`;
  return `subagent ${args.agent ?? '...'} ${preview(args.task ?? '...', 60)}`;
}

export function formatSubagentResultLines(
  progress: AgentProgress,
  options: RenderTextOptions,
): SubagentResultLine[] {
  const icon = progress.status === 'error' ? '✗' : progress.status === 'done' ? '✓' : '▸';
  const statusLine = `${icon} ${progress.agent}${progress.model ? ` (${progress.model})` : ''} — ${
    progress.tools.length
  } tools · ${elapsedSeconds(progress.elapsedMs)}s`;
  const toolLines = formatToolLineItems(progress, options);
  const usage = formatUsage(progress);
  const lines: SubagentResultLine[] = [
    { text: statusLine, kind: 'status', singleLine: false },
    ...toolLines,
  ];

  if (progress.status === 'running' || options.suppressOutput) {
    lines.push({ text: usage, kind: 'usage', singleLine: false });
    return lines;
  }

  const output = options.expanded
    ? progress.output || '(no output)'
    : summaryText(progress.output) || '(no output)';

  lines.push({ text: '', kind: 'blank', singleLine: false });
  lines.push({ text: output, kind: 'output', singleLine: false });
  lines.push({ text: usage, kind: 'usage', singleLine: false });
  return lines;
}

export function formatSubagentResultText(
  progress: AgentProgress,
  options: RenderTextOptions,
): string {
  return formatSubagentResultLines(progress, options)
    .map((line) => line.text)
    .join('\n');
}
