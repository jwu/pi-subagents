import { describe, expect, test } from 'bun:test';
import {
  appendAvailableSubagentsBlock,
  formatAvailableSubagentsBlock,
} from '../extensions/subagent-prompt.ts';

describe('subagent prompt helpers', () => {
  test('formats available subagents as standalone bullet block', () => {
    expect(formatAvailableSubagentsBlock(['worker', 'scout', 'scout'])).toBe(
      'Available subagents:\n- scout\n- worker',
    );
  });

  test('appends available subagents outside promptGuidelines content', () => {
    expect(appendAvailableSubagentsBlock('Base prompt.\n', ['worker', 'scout'])).toBe(
      'Base prompt.\n\nAvailable subagents:\n- scout\n- worker',
    );
  });
});
