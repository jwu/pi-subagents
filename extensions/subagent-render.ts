import type { AgentProgress, AgentToolLog } from './subagent-executor.ts';
import { numberArg, preview, shortenPath, stringArg } from './tool-args.ts';

export interface SubagentCallArgs {
  agent?: string;
  task?: string;
  session?: 'none' | 'fork';
}

export interface RenderTextOptions {
  expanded: boolean;
  suppressOutput?: boolean;
  suppressUsage?: boolean;
  suppressDuration?: boolean;
  expandHint?: string;
  /** 提供时钟时用它推进运行中的耗时；不提供则用快照里的定格值。 */
  now?: () => number;
}

export type SubagentResultLineKind =
  'status' | 'tool' | 'hint' | 'usage' | 'duration' | 'output' | 'blank';

export interface SubagentResultLine {
  text: string;
  kind: SubagentResultLineKind;
  singleLine: boolean;
  /** tool 行在着色时用 tool 字段重建标题，耗时后缀得单独带上。 */
  suffix?: string;
  /** 嵌套进度的缩进量；着色重建标题时不能依赖 text 里的前缀。 */
  indent?: number;
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

export function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** 运行中的工具从 startedAt 算实时耗时；没有实时时钟时退回快照值。 */
function toolDuration(tool: AgentToolLog, now: (() => number) | undefined): string | undefined {
  if (tool.status === 'running') {
    if (tool.startedAt === undefined) {
      return tool.elapsedMs === undefined ? undefined : formatDuration(tool.elapsedMs);
    }
    return formatDuration(now ? now() - tool.startedAt : (tool.elapsedMs ?? 0));
  }
  return tool.elapsedMs === undefined ? undefined : formatDuration(tool.elapsedMs);
}

function summaryText(markdown: string): string {
  return markdown.split('\n').slice(0, 20).join('\n');
}

function formatTokens(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}m`;
  if (Math.abs(value) >= 1_000) return `${Number((value / 1_000).toFixed(1))}k`;
  return String(value);
}

export function formatUsage(progress: AgentProgress): string {
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

function quote(value: string | undefined): string {
  return value ? JSON.stringify(value) : '';
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
  // 整体已结束时不再走实时时钟：残留的 running 工具必须停留在快照耗时上。
  const liveNow = progress.status === 'running' ? options.now : undefined;

  if (hiddenCount > 0) {
    const expandHint = options.expandHint ?? 'to expand';
    lines.push({
      text: `  ... (${hiddenCount} earlier tool calls, ${expandHint})`,
      kind: 'hint',
      singleLine: true,
    });
  }

  for (const tool of visibleTools) {
    const duration = toolDuration(tool, liveNow);
    const suffix = duration ? ` · ${duration}` : '';
    lines.push({
      text: `${tool.status === 'running' ? '▸' : ' '} ${formatToolTitle(tool.name, tool.args)}${suffix}`,
      kind: 'tool',
      singleLine: true,
      ...(suffix ? { suffix } : {}),
      tool: { name: tool.name, args: tool.args, status: tool.status },
    });
    if ((options.expanded || progress.status === 'running') && tool.nested) {
      for (const nested of formatSubagentResultLines(tool.nested, {
        expanded: false,
        suppressOutput: true,
      })) {
        lines.push({ ...nested, text: indent(nested.text, 2), indent: (nested.indent ?? 0) + 2 });
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

/** 仿宿主 bash 工具：运行中叫 Elapsed，结束后定格为 Took。放在结果最下面一行。 */
export function formatSubagentDuration(
  progress: AgentProgress,
  options: { now?: () => number } = {},
): string {
  const running = progress.status === 'running';
  // 只有宿主提供了时钟才实时推进耗时；嵌套快照没有自己的时钟，用定格值。
  const elapsedMs =
    running && options.now ? options.now() - progress.startedAt : progress.elapsedMs;
  return `${running ? 'Elapsed' : 'Took'} ${formatDuration(elapsedMs)}`;
}

export function formatSubagentResultLines(
  progress: AgentProgress,
  options: RenderTextOptions,
): SubagentResultLine[] {
  const running = progress.status === 'running';
  const icon = progress.status === 'error' ? '✗' : progress.status === 'done' ? '✓' : '▸';
  const sessionBadge = progress.session?.effective === 'fork' ? ' [fork]' : '';
  const statusLine = `${icon} ${progress.agent}${sessionBadge}${progress.model ? ` (${progress.model})` : ''} — ${
    progress.tools.length
  } tools`;
  const toolLines = formatToolLineItems(progress, options);
  const usage = formatUsage(progress);
  const durationLines = (): SubagentResultLine[] =>
    options.suppressDuration
      ? []
      : [
          {
            text: formatSubagentDuration(progress, { now: options.now }),
            kind: 'duration',
            singleLine: true,
          },
        ];
  const lines: SubagentResultLine[] = [
    { text: '', kind: 'blank', singleLine: false },
    { text: statusLine, kind: 'status', singleLine: false },
    ...(progress.session?.warning
      ? [{ text: `session: ${progress.session.warning}`, kind: 'hint' as const, singleLine: true }]
      : []),
    ...(progress.warnings ?? []).map((warning) => ({
      text: `warning: ${warning}`,
      kind: 'hint' as const,
      singleLine: true,
    })),
    ...toolLines,
  ];

  if (running || options.suppressOutput) {
    if (!options.suppressUsage) {
      lines.push({ text: '', kind: 'blank', singleLine: false });
      lines.push({ text: usage, kind: 'usage', singleLine: false });
    }
    lines.push(...durationLines());
    return lines;
  }

  const output = options.expanded
    ? progress.output || '(no output)'
    : summaryText(progress.output) || '(no output)';

  lines.push({ text: '', kind: 'blank', singleLine: false });
  lines.push({ text: output, kind: 'output', singleLine: false });

  if (!options.expanded) {
    const totalLines = (progress.output || '').split('\n').length;
    if (totalLines > 20) {
      const hidden = totalLines - 20;
      const expandHint = options.expandHint ?? 'to expand';
      lines.push({
        text: `... (${hidden} more lines, ${expandHint})`,
        kind: 'hint',
        singleLine: true,
      });
    }
  }

  if (!options.suppressUsage) {
    lines.push({ text: '', kind: 'blank', singleLine: false });
    lines.push({ text: usage, kind: 'usage', singleLine: false });
  }
  lines.push(...durationLines());
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
