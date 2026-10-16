import { tmpdir } from "node:os"

import { query } from "@anthropic-ai/claude-agent-sdk"

import conversationIcons from "@workspace/shared/conversation-icons.json"

import { agentStderr } from "./agent-stderr"
import { resolveExecutable } from "./executable"
import { createPromptStream } from "./prompt-stream"
import { sessionEnv } from "./session-env"

import type { ConversationNaming } from "../provider"

const TITLE_LIMIT = 60

const INSTRUCTIONS = [
	"Write a title for the text below, then pick the icon of its subject.",
	"Answer with the title alone on the first line, at most sixty characters.",
	"Write it in the language of the text.",
	"No quotes, no trailing punctuation, no explanation.",
	"On the second line, answer one icon name alone, spelled as in this list:",
	`${conversationIcons.join(", ")}.`,
].join(" ")

const listedIcon = (line: string) =>
	conversationIcons.find((name) => name.toLowerCase() === line.toLowerCase())

export const namingOf = (answer: string): ConversationNaming | null => {
	const [first, ...later] = answer
		.split("\n")
		.map((candidate) => candidate.trim())
		.filter((candidate) => candidate.length > 0)
	const title = first?.slice(0, TITLE_LIMIT).trim()
	if (!title) {
		return null
	}
	return { title, icon: later.map(listedIcon).find(Boolean) ?? null }
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
): Promise<ConversationNaming | null> => {
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
				return message.subtype === "success" ? namingOf(message.result) : null
			}
		}
		return null
	} finally {
		prompts.end()
		run.close()
	}
}
