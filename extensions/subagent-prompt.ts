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
