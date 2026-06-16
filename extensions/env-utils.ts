export type SystemPromptModeEnv = 'replace' | 'replace-all' | 'append';

export type RecursionEnv = Partial<
  Record<
    | 'PI_SUBAGENT_ALLOWED'
    | 'PI_SUBAGENT_DEPTH'
    | 'PI_SUBAGENT_MAX_DEPTH'
    | 'PI_SUBAGENT_NAME'
    | 'PI_SUBAGENT_SYSTEM_PROMPT_MODE',
    string
  >
>;

export function parseEnvNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function allowedAgentNames(env: RecursionEnv): Set<string> | undefined {
  const raw = env?.PI_SUBAGENT_ALLOWED;
  if (!raw) return undefined;
  return new Set(
    raw
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  );
}

export function isPastMaxDepth(env: RecursionEnv): boolean {
  const depth = parseEnvNumber(env?.PI_SUBAGENT_DEPTH);
  const maxDepth = parseEnvNumber(env?.PI_SUBAGENT_MAX_DEPTH);
  return depth !== undefined && maxDepth !== undefined && depth > maxDepth;
}

export function isSubagentProcess(env: RecursionEnv): boolean {
  const depth = parseEnvNumber(env?.PI_SUBAGENT_DEPTH);
  return depth !== undefined && depth > 0;
}

export function subagentSystemPromptMode(env: RecursionEnv): SystemPromptModeEnv | undefined {
  const mode = env?.PI_SUBAGENT_SYSTEM_PROMPT_MODE;
  if (mode === 'replace' || mode === 'replace-all' || mode === 'append') return mode;
  return undefined;
}

export function isSubagentReplaceSystemPrompt(env: RecursionEnv): boolean {
  const mode = subagentSystemPromptMode(env);
  return isSubagentProcess(env) && (mode === 'replace' || mode === 'replace-all');
}
