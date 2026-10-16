import { tmpdir } from "node:os"

import { query } from "@anthropic-ai/claude-agent-sdk"

import { agentStderr } from "./agent-stderr"
import { resolveExecutable } from "./executable"
import { createPromptStream } from "./prompt-stream"
import { sessionEnv } from "./session-env"

const TITLE_LIMIT = 60

const INSTRUCTIONS = [
	"Write a title for the text below.",
	"Answer with the title alone, on a single line, at most sixty characters.",
	"Write it in the language of the text.",
	"No quotes, no trailing punctuation, no explanation.",
].join(" ")

export const shortTitle = (answer: string): string | null => {
	const line = answer
		.split("\n")
		.map((candidate) => candidate.trim())
		.find((candidate) => candidate.length > 0)
	return line?.slice(0, TITLE_LIMIT).trim() || null
}

const asked = (text: string) => `${INSTRUCTIONS}\n\n${text}`

export const titleOptions = (connection?: Record<string, string>) => ({
	cwd: tmpdir(),
	allowedTools: [],
	permissionMode: "default" as const,
	settingSources: [],
	persistSession: false,
	pathToClaudeCodeExecutable: resolveExecutable(),
	env: sessionEnv(connection),
	stderr: agentStderr("title"),
})

export const claudeTitle = async (
	text: string,
	connection?: Record<string, string>,
): Promise<string | null> => {
	if (!text.trim()) {
		return null
	}
	const prompts = createPromptStream()
	const run = query({
		prompt: prompts.stream,
		options: titleOptions(connection),
	})
	try {
		prompts.push(asked(text))
		for await (const message of run) {
			if (message.type === "result") {
				return message.subtype === "success" ? shortTitle(message.result) : null
			}
		}
		return null
	} finally {
		prompts.end()
		run.close()
	}
}
