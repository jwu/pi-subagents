import { homedir } from 'node:os';
import type { AgentProgress } from './subagent-executor.ts';

export interface SubagentCallArgs {
  agent?: string;
  task?: string;
}

export interface RenderTextOptions {
  expanded: boolean;
}

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
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join('\n');
}

function formatUsage(progress: AgentProgress): string {
  const usage = progress.usage;
  const context =
    usage.contextWindow && usage.contextWindow > 0
      ? ` ${Math.round((usage.contextTokens / usage.contextWindow) * 100)}%/${usage.contextWindow}`
      : '';
  return `↑${usage.input} ↓${usage.output} R${usage.cacheRead} W${usage.cacheWrite} $${usage.cost.toFixed(
    4,
  )}${context}`;
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

function formatToolTitle(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'ls':
      return `${name} ${quote(shortenPath(args.path ?? '.'))}`.trimEnd();
    case 'read':
    case 'write':
    case 'edit':
      return `${name} ${quote(shortenPath(args.path ?? args.file_path))}`.trimEnd();
    case 'grep': {
      const pattern = stringArg(args, 'pattern');
      const target = shortenPath(args.path);
      return `${name} ${quote(pattern)}${target ? ` in ${quote(target)}` : ''}`.trimEnd();
    }
    case 'find': {
      const pattern = stringArg(args, 'pattern');
      const target = shortenPath(args.path);
      return `${name} ${quote(pattern)}${target ? ` in ${quote(target)}` : ''}`.trimEnd();
    }
    case 'webfetch':
      return `${name} ${quote(stringArg(args, 'url'))}`.trimEnd();
    case 'bash':
      return `${name} ${quote(stringArg(args, 'command'))}`.trimEnd();
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

function formatToolLines(progress: AgentProgress, options: RenderTextOptions): string[] {
  const lines: string[] = [];
  for (const tool of progress.tools) {
    lines.push(`${tool.status === 'running' ? '▸' : ' '} ${formatToolTitle(tool.name, tool.args)}`);
    if (options.expanded && tool.nested) {
      lines.push(indent(formatSubagentResultText(tool.nested, { expanded: false }), 2));
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

export function formatSubagentResultText(
  progress: AgentProgress,
  options: RenderTextOptions,
): string {
  const icon = progress.status === 'error' ? '✗' : progress.status === 'done' ? '✓' : '▸';
  const statusLine = `${icon} ${progress.agent}${progress.model ? ` (${progress.model})` : ''} — ${
    progress.tools.length
  } tools · ${elapsedSeconds(progress.elapsedMs)}s`;
  const toolLines = formatToolLines(progress, options);
  const output = options.expanded
    ? progress.output || '(no output)'
    : summaryText(progress.output) || '(no output)';

  return [statusLine, ...toolLines, output, formatUsage(progress)].join('\n');
}
