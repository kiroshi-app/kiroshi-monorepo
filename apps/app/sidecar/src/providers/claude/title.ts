import { tmpdir } from "node:os"

import { query } from "@anthropic-ai/claude-agent-sdk"

import conversationIcons from "@workspace/shared/conversation-icons.json"

import { agentStderr } from "./agent-stderr"
import { resolveExecutable } from "./executable"
import { createPromptStream } from "./prompt-stream"
import { sessionEnv } from "./session-env"

import type { ConversationNaming } from "../provider"

const TITLE_LIMIT = 60

const ANSWER_EXAMPLE = "Ship the beta to the first testers\nRocket"

const INSTRUCTIONS = [
	"Write a title for the text below, then pick the icon of its subject.",
	"Answer with the title alone on the first line, at most sixty characters.",
	"Write it in the language of the text.",
	"No quotes, no trailing punctuation, no explanation.",
	"On the second line, answer one icon name alone, spelled as in this list:",
	`${conversationIcons.join(", ")}.`,
	"For a text about shipping a beta, the whole answer reads:",
].join(" ")

const DECORATION = /^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu

const LABEL = /^[^:]*:/

const TRAILING_ICON =
	/^(.*[^\s\p{P}\p{S}])\s*[\p{P}\p{S}][\s\p{P}\p{S}]*?(\p{L}+)[\s\p{P}\p{S}]*$/u

const listedIcon = (name: string) =>
	conversationIcons.find(
		(listed) => listed.toLowerCase() === name.toLowerCase(),
	)

const iconAlone = (line: string) =>
	listedIcon(line.replace(LABEL, "").replace(DECORATION, ""))

const titleBeforeIcon = (line: string) => {
	const [, title, name] = line.match(TRAILING_ICON) ?? []
	const icon = name && listedIcon(name)
	return title && icon ? { title, icon } : { title: line, icon: null }
}

export const namingOf = (answer: string): ConversationNaming | null => {
	const [first, ...later] = answer
		.split("\n")
		.map((candidate) => candidate.trim())
		.filter((candidate) => candidate.length > 0)
	if (!first) {
		return null
	}
	const icon = later.map(iconAlone).find(Boolean)
	const naming = icon ? { title: first, icon } : titleBeforeIcon(first)
	const title = naming.title.slice(0, TITLE_LIMIT).trim()
	return title ? { title, icon: naming.icon } : null
}

export const titlePrompt = (text: string) =>
	[INSTRUCTIONS, ANSWER_EXAMPLE, text].join("\n\n")

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
		prompts.push(titlePrompt(text))
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
