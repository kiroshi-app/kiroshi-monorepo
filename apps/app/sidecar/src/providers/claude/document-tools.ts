import { type SdkMcpToolDefinition, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { carriedTo } from "./host-calls"

const SUBTYPE = "library"

export const DOCUMENT_READ_TOOL_NAME = "document_read"

export const DOCUMENT_WRITE_TOOL_NAME = "document_write"

const READ =
	"Read a Markdown document of the Library of this Space, as it stands now with what everyone has typed in it. It answers its name and its text."

const WRITE =
	"Write text into a Markdown document of the Library of this Space, live, beside the people editing it. The text lands at the end of the document, or right after the passage you name. Nothing is replaced or removed. It answers the name and how many characters you wrote."

const NAME =
	"The name of the document in the Library of this Space, with its extension, such as notes.md."

const TEXT =
	"The Markdown to write, with the line breaks it needs to stand on its own lines."

const AFTER =
	"An exact passage of the document, copied from document_read, that occurs once in it: the text lands right after it. Leave it out to write at the end."

type ToolInput = Record<string, z.ZodType>

const NAMED: ToolInput = { name: z.string().describe(NAME) }

const WRITTEN: ToolInput = {
	...NAMED,
	text: z.string().describe(TEXT),
	after: z.string().describe(AFTER).optional(),
}

const asked = carriedTo(SUBTYPE)

export const documentTools = (
	session: string | undefined,
): SdkMcpToolDefinition<ToolInput>[] => [
	tool(DOCUMENT_READ_TOOL_NAME, READ, NAMED, (input) =>
		asked(session, "read", input),
	),
	tool(DOCUMENT_WRITE_TOOL_NAME, WRITE, WRITTEN, (input) =>
		asked(session, "write", input),
	),
]
