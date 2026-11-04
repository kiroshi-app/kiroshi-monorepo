import { type SdkMcpToolDefinition, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { type AttachScope, onReadablePath } from "./companion-tools"
import { carriedTo, spoken } from "./host-calls"

const SUBTYPE = "library"

const LIST =
	"List the items of the Library of this Space, the latest update first, each with its name, its kind (document or image) and its updatedAt in milliseconds since the epoch, before you read, write, rename or delete one whose name you do not hold."

const KIND =
	"One of document or image to list only that kind; left out, every kind is listed."

const LIMIT = "How many items to answer, from 1 to 200; left out, 50."

const CURSOR =
	"The cursor the previous library_list answered, to list the page after it; left out, the list starts at the latest update, and a null cursor in the answer marks the last page."

const SEARCH =
	"Find the items of the Library of this Space whose name or document text holds the words you give, whatever their case, each with its name, its kind and its updatedAt, the latest update first; an empty list means nothing in this Library matched, and no other Space is ever searched."

const QUERY = "The words to look for, matched whatever their case."

const READ =
	"Read an item of the Library of this Space by its name. A document answers its text as it stands now with what everyone has typed in it; an image is shown to you; an image too large to show answers its name, its type and its size."

const CREATE =
	"Create a Markdown document in the Library of this Space, empty or filled from a template, shown in the Library of the person right away. A name already taken is refused. It answers the name, the kind and the updatedAt of the document."

const CREATED_NAME =
	"The name of the new document, ending in .md, such as minutes.md, without any folder."

const TEMPLATE =
	"One of meeting-notes, project-brief, decision-record or weekly-update to start the document from that template; left out, the document starts empty."

const WRITE =
	"Write text into a Markdown document of the Library of this Space, live, beside the people editing it. The text lands at the end of the document, or right after the passage you name. Nothing is replaced or removed. It answers the name and how many characters you wrote."

const NAME =
	"The name of the item in the Library of this Space, with its extension, such as notes.md."

const TEXT =
	"The Markdown to write, with the line breaks it needs to stand on its own lines."

const AFTER =
	"An exact passage of the document, copied from library_read, that occurs once in it: the text lands right after it. Leave it out to write at the end."

const IMPORT =
	"Copy a file you produced into the Library of this Space, a Markdown or text document or a PNG, JPEG, GIF or WebP image, under its own name, a number added when that name is taken. It answers the name the copy landed under, its kind and its updatedAt."

const PATH =
	"The path of the file to copy, absolute or relative to your working directory."

const RENAME =
	"Rename a document of the Library of this Space, keeping its extension, as the person renames it: the people editing it follow it under the new name, a number added when that name is taken. It answers the name it landed under, its kind and its updatedAt."

const NEW_NAME =
	"The new name of the document, with the same extension, without any folder."

const DELETE =
	"Delete an item of the Library of this Space for everyone, with its thumbnail and its shared editing state, once the person asked you to remove it. It can't be undone. It answers the name of the item deleted."

const POST_DOCUMENT =
	"Post a document of the Library of this Space in this conversation, as a message of yours the person opens it from, once you want them to read it. A name that is not a document of this Library is refused and nothing is posted. It answers the name of the document, the id of this conversation and the id of the message."

type ToolInput = Record<string, z.ZodType>

const LISTED: ToolInput = {
	kind: z.enum(["document", "image"]).optional().describe(KIND),
	limit: z.number().int().optional().describe(LIMIT),
	cursor: z.string().optional().describe(CURSOR),
}

const SEARCHED: ToolInput = { query: z.string().describe(QUERY) }

const NAMED: ToolInput = { name: z.string().describe(NAME) }

const CREATED: ToolInput = {
	name: z.string().describe(CREATED_NAME),
	template: z
		.enum([
			"meeting-notes",
			"project-brief",
			"decision-record",
			"weekly-update",
		])
		.optional()
		.describe(TEMPLATE),
}

const WRITTEN: ToolInput = {
	...NAMED,
	text: z.string().describe(TEXT),
	after: z.string().describe(AFTER).optional(),
}

const IMPORTED: ToolInput = { path: z.string().describe(PATH) }

const RENAMED: ToolInput = {
	...NAMED,
	newName: z.string().describe(NEW_NAME),
}

type ImageRead = { form: "image"; mimeType: string; content: string }

const isImageRead = (answer: unknown): answer is ImageRead =>
	(answer as ImageRead | null)?.form === "image"

const shownToTheModel = (answer: unknown) =>
	isImageRead(answer)
		? {
				content: [
					{
						type: "image" as const,
						data: answer.content,
						mimeType: answer.mimeType,
					},
				],
			}
		: spoken(answer)

const asked = carriedTo(SUBTYPE)

const read = carriedTo(SUBTYPE, shownToTheModel)

type ImportInput = { path: string }

export const libraryTools = (
	session: string | undefined,
	scope: AttachScope,
): SdkMcpToolDefinition<ToolInput>[] => [
	tool("library_list", LIST, LISTED, (input) => asked(session, "list", input)),
	tool("library_search", SEARCH, SEARCHED, (input) =>
		asked(session, "search", input),
	),
	tool("library_read", READ, NAMED, (input) => read(session, "read", input)),
	tool("library_create", CREATE, CREATED, (input) =>
		asked(session, "create", input),
	),
	tool("library_write", WRITE, WRITTEN, (input) =>
		asked(session, "write", input),
	),
	tool("library_import", IMPORT, IMPORTED, (input) =>
		onReadablePath(scope, (input as ImportInput).path, (path) =>
			asked(session, "import", { path }),
		),
	),
	tool("library_rename", RENAME, RENAMED, (input) =>
		asked(session, "rename", input),
	),
	tool("library_delete", DELETE, NAMED, (input) =>
		asked(session, "delete", input),
	),
	tool("conversation_post_document", POST_DOCUMENT, NAMED, (input) =>
		asked(session, "postDocument", input),
	),
]
