import { tmpdir } from "node:os"

import { query } from "@anthropic-ai/claude-agent-sdk"

import { agentStderr } from "./agent-stderr"
import { resolveExecutable } from "./executable"
import { createPromptStream } from "./prompt-stream"
import { sessionEnv } from "./session-env"

const MCP_PREFIX = "mcp__"

const OPENING = "."

export const builtInTools = (named: string[]) =>
	named.filter((tool) => !tool.startsWith(MCP_PREFIX))

export const toolsOptions = (connection?: Record<string, string>) => ({
	cwd: tmpdir(),
	pathToClaudeCodeExecutable: resolveExecutable(),
	env: sessionEnv(connection),
	stderr: agentStderr("tools"),
})

export const claudeTools = async (connection?: Record<string, string>) => {
	const prompts = createPromptStream()
	const run = query({
		prompt: prompts.stream,
		options: toolsOptions(connection),
	})
	try {
		prompts.push(OPENING)
		for await (const message of run) {
			if (message.type === "system" && message.subtype === "init") {
				return builtInTools(message.tools)
			}
		}
		return []
	} finally {
		prompts.end()
		run.close()
	}
}
