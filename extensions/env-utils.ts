export type RecursionEnv = Partial<
  Record<'PI_SUBAGENT_ALLOWED' | 'PI_SUBAGENT_DEPTH' | 'PI_SUBAGENT_MAX_DEPTH', string>
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
