import { describe, expect, test } from 'bun:test';
import {
  allowedAgentNames,
  isPastMaxDepth,
  isSubagentProcess,
  isSubagentReplaceSystemPrompt,
  parseEnvNumber,
  subagentSystemPromptMode,
} from '../extensions/env-utils.ts';

describe('parseEnvNumber', () => {
  test('returns undefined for undefined input', () => {
    expect(parseEnvNumber(undefined)).toBeUndefined();
  });

  test('returns undefined for non-numeric string', () => {
    expect(parseEnvNumber('abc')).toBeUndefined();
  });

  test('returns undefined for Infinity', () => {
    expect(parseEnvNumber('Infinity')).toBeUndefined();
  });

  test('returns the parsed integer for a numeric string', () => {
    expect(parseEnvNumber('42')).toBe(42);
  });

  test('returns 0 for "0"', () => {
    expect(parseEnvNumber('0')).toBe(0);
  });

  test('returns a negative number for a negative string', () => {
    expect(parseEnvNumber('-1')).toBe(-1);
  });
});

describe('allowedAgentNames', () => {
  test('returns undefined when PI_SUBAGENT_ALLOWED is not set', () => {
    expect(allowedAgentNames({})).toBeUndefined();
  });

  test('returns undefined when PI_SUBAGENT_ALLOWED is empty string', () => {
    expect(allowedAgentNames({ PI_SUBAGENT_ALLOWED: '' })).toBeUndefined();
  });

  test('returns an empty set when PI_SUBAGENT_ALLOWED contains only whitespace', () => {
    const result = allowedAgentNames({ PI_SUBAGENT_ALLOWED: '  , , ' });
    expect(result).not.toBeUndefined();
    expect(result!.size).toBe(0);
  });

  test('returns a set of agent names from comma-separated value', () => {
    const result = allowedAgentNames({ PI_SUBAGENT_ALLOWED: 'scout, reviewer, tester' });
    expect(result).not.toBeUndefined();
    expect(result!.has('scout')).toBe(true);
    expect(result!.has('reviewer')).toBe(true);
    expect(result!.has('tester')).toBe(true);
    expect(result!.size).toBe(3);
  });

  test('trims whitespace around agent names', () => {
    const result = allowedAgentNames({ PI_SUBAGENT_ALLOWED: '  scout , reviewer  ' });
    expect(result!.has('scout')).toBe(true);
    expect(result!.has('reviewer')).toBe(true);
    expect(result!.size).toBe(2);
  });

  test('filters out empty entries', () => {
    const result = allowedAgentNames({ PI_SUBAGENT_ALLOWED: 'scout,,reviewer' });
    expect(result!.has('scout')).toBe(true);
    expect(result!.has('reviewer')).toBe(true);
    expect(result!.size).toBe(2);
  });
});

describe('isPastMaxDepth', () => {
  test('returns false when neither depth nor maxDepth is set', () => {
    expect(isPastMaxDepth({})).toBe(false);
  });

  test('returns false when only depth is set', () => {
    expect(isPastMaxDepth({ PI_SUBAGENT_DEPTH: '3' })).toBe(false);
  });

  test('returns false when only maxDepth is set', () => {
    expect(isPastMaxDepth({ PI_SUBAGENT_MAX_DEPTH: '5' })).toBe(false);
  });

  test('returns false when depth is below maxDepth', () => {
    expect(isPastMaxDepth({ PI_SUBAGENT_DEPTH: '1', PI_SUBAGENT_MAX_DEPTH: '10' })).toBe(false);
  });

  test('returns false when depth equals maxDepth', () => {
    expect(isPastMaxDepth({ PI_SUBAGENT_DEPTH: '3', PI_SUBAGENT_MAX_DEPTH: '3' })).toBe(false);
  });

  test('returns true when depth exceeds maxDepth', () => {
    expect(isPastMaxDepth({ PI_SUBAGENT_DEPTH: '5', PI_SUBAGENT_MAX_DEPTH: '3' })).toBe(true);
  });

  test('returns false when depth is 0 and maxDepth is 0', () => {
    expect(isPastMaxDepth({ PI_SUBAGENT_DEPTH: '0', PI_SUBAGENT_MAX_DEPTH: '0' })).toBe(false);
  });

  test('returns true when depth is 1 and maxDepth is 0', () => {
    expect(isPastMaxDepth({ PI_SUBAGENT_DEPTH: '1', PI_SUBAGENT_MAX_DEPTH: '0' })).toBe(true);
  });
});

describe('subagent process env helpers', () => {
  test('detects subagent process from positive depth', () => {
    expect(isSubagentProcess({ PI_SUBAGENT_DEPTH: '1' })).toBe(true);
    expect(isSubagentProcess({ PI_SUBAGENT_DEPTH: '0' })).toBe(false);
    expect(isSubagentProcess({})).toBe(false);
  });

  test('parses only supported system prompt modes', () => {
    expect(subagentSystemPromptMode({ PI_SUBAGENT_SYSTEM_PROMPT_MODE: 'replace' })).toBe('replace');
    expect(subagentSystemPromptMode({ PI_SUBAGENT_SYSTEM_PROMPT_MODE: 'append' })).toBe('append');
    expect(subagentSystemPromptMode({ PI_SUBAGENT_SYSTEM_PROMPT_MODE: 'other' })).toBeUndefined();
  });

  test('detects replace-mode subagent process', () => {
    expect(
      isSubagentReplaceSystemPrompt({
        PI_SUBAGENT_DEPTH: '1',
        PI_SUBAGENT_SYSTEM_PROMPT_MODE: 'replace',
      }),
    ).toBe(true);
    expect(
      isSubagentReplaceSystemPrompt({
        PI_SUBAGENT_DEPTH: '1',
        PI_SUBAGENT_SYSTEM_PROMPT_MODE: 'append',
      }),
    ).toBe(false);
    expect(isSubagentReplaceSystemPrompt({ PI_SUBAGENT_SYSTEM_PROMPT_MODE: 'replace' })).toBe(
      false,
    );
  });
});
