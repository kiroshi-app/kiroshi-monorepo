import { type SdkMcpToolDefinition, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { carriedTo } from "./host-calls"

const SUBTYPE = "bundle"

export const BUNDLE_WRITE_TOOL_NAME = "bundle_write"

const WRITE =
	"Write one file of your own directory, the one your instructions name as the place your skills live, and keep it as one change in your history. A skill file under skills/ ending in .md is written whole, its folders created. agents/agent.md takes only what you learned: the text replaces the block between its two kiroshi memory lines and nothing else of that file moves. It answers the id of the change, or unchanged when the file already says that."

const PATH =
	"The file, relative to your own directory: skills/<name>/SKILL.md, another .md under skills/, or agents/agent.md."

const TEXT =
	"The whole new text of a skill file, or for agents/agent.md the whole new text of the block of what you learned, without its two kiroshi lines."

const TITLE =
	"What changed, in one line of at most 72 characters, in the language of the conversation, for someone who does not read code."

const SUMMARY =
	"One to three lines saying what changed and why, in the language of the conversation."

type ToolInput = Record<string, z.ZodType>

const WRITTEN: ToolInput = {
	path: z.string().describe(PATH),
	text: z.string().describe(TEXT),
	title: z.string().describe(TITLE),
	summary: z.string().describe(SUMMARY),
}

const asked = carriedTo(SUBTYPE)

export const bundleTools = (
	session: string | undefined,
): SdkMcpToolDefinition<ToolInput>[] => [
	tool(BUNDLE_WRITE_TOOL_NAME, WRITE, WRITTEN, (input) =>
		asked(session, "write", input),
	),
]
