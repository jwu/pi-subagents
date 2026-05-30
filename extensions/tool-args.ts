import { homedir } from 'node:os';

export function preview(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

export function shortenPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const home = homedir();
  return value.startsWith(`${home}/`) ? `~/${value.slice(home.length + 1)}` : value;
}

export function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
}

export function numberArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === 'number' ? value : undefined;
}
