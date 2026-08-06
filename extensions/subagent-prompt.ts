export const AUTO_RUNTIME_TOOLS_MARKER = '<pi-subagents-runtime-tools />';
export const LEGACY_RUNTIME_TOOLS_MARKER = '<pi-runtime-tools />';

export interface ToolGuidelinePromptOptions {
  selectedTools?: string[];
  toolSnippets?: Record<string, string>;
  promptGuidelines?: string[];
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function formatAvailableToolsAndGuidelinesBlock(
  options: ToolGuidelinePromptOptions,
): string | undefined {
  const selectedTools = options.selectedTools ?? ['read', 'bash', 'edit', 'write'];
  const visibleTools = selectedTools.filter((name) => options.toolSnippets?.[name]);
  const toolsList =
    visibleTools.length > 0
      ? visibleTools.map((name) => `- ${name}: ${options.toolSnippets![name]}`).join('\n')
      : '(none)';

  const hasBashOnlyForFileExploration =
    selectedTools.includes('bash') &&
    !selectedTools.includes('grep') &&
    !selectedTools.includes('find') &&
    !selectedTools.includes('ls');
  const guidelines = uniqueNonEmpty([
    ...(hasBashOnlyForFileExploration ? ['Use bash for file operations like ls, rg, find'] : []),
    ...(options.promptGuidelines ?? []),
    'Be concise in your responses',
    'Show file paths clearly when working with files',
  ]);
  const guidelineLines = guidelines.map((guideline) => `- ${guideline}`).join('\n');

  return [
    'Available tools:',
    toolsList,
    '',
    'In addition to the tools above, you may have access to other custom tools depending on the project.',
    '',
    'Guidelines:',
    guidelineLines || '(none)',
  ].join('\n');
}

export function injectRuntimeToolsBlock(
  systemPrompt: string,
  options: ToolGuidelinePromptOptions,
): string {
  const block = formatAvailableToolsAndGuidelinesBlock(options) ?? '';
  if (systemPrompt.includes(AUTO_RUNTIME_TOOLS_MARKER)) {
    return systemPrompt
      .replace(AUTO_RUNTIME_TOOLS_MARKER, block)
      .replaceAll(LEGACY_RUNTIME_TOOLS_MARKER, '');
  }
  return systemPrompt.replace(LEGACY_RUNTIME_TOOLS_MARKER, block);
}
