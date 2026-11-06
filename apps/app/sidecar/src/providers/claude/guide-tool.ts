import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import boards from "./guides/boards.md" with { type: "text" }
import documents from "./guides/documents.md" with { type: "text" }

export const GUIDE_TOOL_NAME = "get_guide"

export const GUIDES = { boards, documents }

const TOPICS = ["boards", "documents"] as const

export const GUIDE_INSTRUCTIONS = `Call ${GUIDE_TOOL_NAME} once per session, before your first library_, document_, board_ or screenshot call: with the topic boards before working on a board, with the topic documents before working on the Library or a document. The guide it answers is how you work there.`

const GUIDE =
	"The guide to working in the Library of this Space: boards for its boards, documents for the Library and its Markdown documents. Call it once per session with the matching topic, before the first library_, document_, board_ or screenshot call. It answers the guide as Markdown."

const TOPIC = "boards for a board, documents for the Library and its documents."

export const guideTool = () =>
	tool(
		GUIDE_TOOL_NAME,
		GUIDE,
		{ topic: z.enum(TOPICS).describe(TOPIC) },
		async ({ topic }) => ({
			content: [{ type: "text" as const, text: GUIDES[topic] }],
		}),
	)
