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

function appendBeforeTrailingRuntimeMetadata(systemPrompt: string, block: string): string {
  const marker = '\nCurrent date:';
  const index = systemPrompt.lastIndexOf(marker);
  if (index === -1) return `${systemPrompt.trimEnd()}\n\n${block}`;

  const before = systemPrompt.slice(0, index).trimEnd();
  const after = systemPrompt.slice(index);
  return `${before}\n\n${block}${after}`;
}

export function appendAvailableToolsAndGuidelinesBlock(
  systemPrompt: string,
  options: ToolGuidelinePromptOptions,
): string {
  const block = formatAvailableToolsAndGuidelinesBlock(options);
  if (!block || systemPrompt.includes(block)) {
    return systemPrompt;
  }

  return appendBeforeTrailingRuntimeMetadata(systemPrompt, block);
}

export function formatAvailableSubagentsBlock(agentNames: string[]): string | undefined {
  const names = [...new Set(agentNames.map((name) => name.trim()).filter(Boolean))].sort();
  if (names.length === 0) return undefined;

  return ['Available subagents:', ...names.map((name) => `- ${name}`)].join('\n');
}

export function appendAvailableSubagentsBlock(systemPrompt: string, agentNames: string[]): string {
  const block = formatAvailableSubagentsBlock(agentNames);
  if (!block || systemPrompt.includes(block)) return systemPrompt;

  return `${systemPrompt.trimEnd()}\n\n${block}`;
}
