# pi-subagents

Sub-agents extension for [pi](https://github.com/badlogic/pi-mono) coding agent.

Delegates tasks to isolated pi child processes — each running with its own model, system prompt, and tool set. Sub-agents inherit zero conversation context; all necessary context must be provided in the task description.

## Install

```bash
pi install npm:@johnnywu/pi-subagents
```

## Quick start

### 1. Define an agent

Create a `.pi/agents/code-reviewer.md` file in your project:

```markdown
---
name: code-reviewer
description: Reviews code changes for correctness and style
tools: read, grep, find, ls, bash
model: anthropic/claude-sonnet-4-6
thinking: low
---

You are a code reviewer. When given a diff or file list, read the relevant
files and provide a concise review covering:

- Logic errors and edge cases
- Style and consistency issues
- Performance concerns
- Test coverage gaps
```

### 2. Use it

The `subagent` tool is automatically registered. In a pi session:

```
Review the changes in src/auth.ts using the code-reviewer agent
```

Or instruct pi to delegate:

```
Run the code-reviewer agent on the last three commits
```

### Available subagents in the prompt

The extension exposes discovered sub-agents to the model in two places:

- The `subagent` tool keeps a one-line prompt guideline:
  `Available subagents: code-reviewer, refactor, test-writer`
- The system prompt also gets an independent block:

```text
Available subagents:
- code-reviewer
- refactor
- test-writer
```

For sub-agents launched with `systemPrompt: replace` or `systemPrompt: append`, the same block is written into the prompt passed via `--system-prompt` or `--append-system-prompt` when that agent has the `subagent` tool.

## Agent configuration

Agents are Markdown files with YAML frontmatter.

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | **yes** | — | Unique agent identifier |
| `description` | no | — | Human-readable summary |
| `tools` | no | _none_ | Comma-separated tool whitelist (`read, write, bash, grep`, etc.) |
| `model` | no | parent's model | Provider/model-id (`anthropic/claude-sonnet-4-6`) |
| `thinking` | no | `off` | Reasoning level: `off`, `low`, `medium`, `high` |
| `systemPrompt` | no | `replace` | How the body is applied: `replace` (default system prompt) or `append` |
| `allowedAgents` | no | _all_ | Comma-separated list of sub-agents this agent may spawn |
| `maxDepth` | no | `10` | Maximum recursion depth (`0` = no sub-agents, `1` = one level, etc.) |

The Markdown body after the frontmatter is the agent's system prompt.

### Example with all fields

```markdown
---
name: orchestrator
description: High-level planner that delegates to specialists
tools: subagent, read, grep, find
model: anthropic/claude-sonnet-4-6
thinking: high
systemPrompt: replace
allowedAgents: code-reviewer, refactor, test-writer
maxDepth: 2
---

You are an orchestrator. Break complex tasks into sub-tasks and delegate
them to specialist agents. Combine their results and report a summary.
```

## Agent discovery

Agents are discovered from two locations (project overrides global):

| Scope | Path |
|-------|------|
| Global | `~/.pi/agent/agents/*.md` |
| Project | `.pi/agents/*.md` |

Only `.md` files are scanned. Files are parsed at extension load time; parse errors produce warnings but don't block other agents.

## Recursion control

Sub-agents can spawn their own sub-agents (if the `subagent` tool is in their whitelist). Two mechanisms prevent unbounded recursion:

**`maxDepth`** — Hard limit counting from the originating agent. `maxDepth: 0` means the agent cannot spawn sub-agents. `maxDepth: 1` allows one level, etc. Defaults to `10` when the agent has `subagent` in tools.

**`allowedAgents`** — Whitelist enforced by the parent before spawning. A child process never sees agent names outside its parent's whitelist.

The available-subagents prompt entries respect the same filtering: parent sessions use the currently visible agents, and child sessions only list agents allowed by their parent.

These are passed via environment variables (`PI_SUBAGENT_DEPTH`, `PI_SUBAGENT_MAX_DEPTH`, `PI_SUBAGENT_ALLOWED`).

## Session storage

Sub-agent sessions are saved as `.jsonl` files for post-hoc debugging:

```
~/.pi/agent/sessions/--{safe-project-path}--/subagents/
  ├── 2026-05-31T03-47-16-502Z_019e7c24-a395-707a-a262-ec5b1664ffa7.jsonl
  └── ...
```

Each file contains one JSON object per line — session headers, messages, tool calls, and usage data. Parent pi sessions live in the same project directory (no `subagents/` subdirectory).

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type-check
bun run typecheck

# Format
bun run format

# Release (requires GH_TOKEN and NPM_TOKEN)
bun run release
```

This project uses [semantic-release](https://semantic-release.gitbook.io) with [conventional commits](https://www.conventionalcommits.org/).

## License

MIT
